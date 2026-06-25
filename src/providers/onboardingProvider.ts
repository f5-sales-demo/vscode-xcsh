// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { detectAll, INTEGRATIONS, type IntegrationDef, type IntegrationStatus } from '../utils/integrationDetector';
import { escapeHtml, getF5LogoHtml, getNonce, getWebviewBaseStyles } from '../utils/panelBaseStyles';

const AUTO_OPEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'platform', label: 'Platform Core' },
  { key: 'cloud', label: 'Cloud Providers' },
  { key: 'devtools', label: 'Dev Tools' },
  { key: 'ai', label: 'AI' },
];

export class OnboardingProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly contextManager: ContextManager) {}

  async showPanel(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'xcshOnboarding',
      vscode.l10n.t('xcsh Platform Readiness'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message: { command: string; text?: string }) => {
      switch (message.command) {
        case 'refresh':
          await this.refresh();
          break;
        case 'copy':
          if (message.text) {
            await vscode.env.clipboard.writeText(message.text);
            void vscode.window.showInformationMessage(vscode.l10n.t('Copied to clipboard'));
          }
          break;
        case 'run':
          if (message.text) {
            const terminal = vscode.window.createTerminal({ name: 'xcsh setup' });
            terminal.show();
            terminal.sendText(message.text, false);
          }
          break;
        case 'addContext':
          void vscode.commands.executeCommand('xcsh.addContext');
          break;
      }
    });

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      const statuses = await detectAll(this.contextManager);
      this.panel.webview.html = this.buildHtml(statuses);
    } catch {
      this.panel.webview.html = this.buildHtml([]);
    }
  }

  async shouldAutoOpen(globalState: vscode.Memento): Promise<boolean> {
    if (globalState.get<boolean>('onboarding.dismissed')) {
      return false;
    }
    if (!globalState.get<boolean>('onboarding.shown')) {
      return true;
    }
    const lastCheck = globalState.get<number>('onboarding.lastCheck') ?? 0;
    if (Date.now() - lastCheck < AUTO_OPEN_COOLDOWN_MS) {
      return false;
    }
    void globalState.update('onboarding.lastCheck', Date.now());
    const statuses = await detectAll(this.contextManager);
    return statuses.some((s) => s.state !== 'connected' && s.state !== 'unknown');
  }

  private buildHtml(statuses: IntegrationStatus[]): string {
    const nonce = getNonce();
    const statusMap = new Map(statuses.map((s) => [s.id, s]));

    const connected = statuses.filter((s) => s.state === 'connected').length;
    const total = statuses.filter((s) => s.state !== 'unknown').length;
    const pct = total > 0 ? Math.round((connected / total) * 100) : 0;

    const categorySections = CATEGORIES.map((cat) => {
      const defs = INTEGRATIONS.filter((d) => d.category === cat.key);
      if (defs.length === 0) {
        return '';
      }
      const cards = defs.map((def) => this.renderCard(def, statusMap.get(def.id))).join('');
      return `<div class="category-section">
        <div class="category-title">${escapeHtml(cat.label)}</div>
        <div class="cards-grid">${cards}</div>
      </div>`;
    }).join('');

    const cspSource = this.panel?.webview.cspSource ?? '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource};">
  <title>${vscode.l10n.t('Platform Readiness')}</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      ${getF5LogoHtml()}
      <span class="title">${vscode.l10n.t('Platform Readiness')}</span>
    </div>
    <div class="toolbar-right">
      <button class="btn" id="refresh">${vscode.l10n.t('Refresh')}</button>
    </div>
  </div>

  <div class="hero">
    <div class="hero-stat">${vscode.l10n.t('{0} of {1} integrations ready', connected, total)}</div>
    <div class="progress-bar"><div class="progress-fill" style="width: ${pct}%"></div></div>
  </div>

  <div class="container">
    ${categorySections}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refresh')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const text = btn.dataset.text;
      vscode.postMessage({ command: action, text });
    });
  </script>
</body>
</html>`;
  }

  private renderCard(def: IntegrationDef, status: IntegrationStatus | undefined): string {
    const state = status?.state ?? 'unknown';
    const { icon, label, cssClass } = this.stateDisplay(state);
    const actionHtml = this.renderAction(def, status);

    return `<div class="card card-${cssClass}">
      <div class="card-header">
        <div class="card-badge" style="background: ${def.badge.color}">${escapeHtml(def.badge.label)}</div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(def.name)}</div>
          <div class="card-status ${cssClass}">${icon} ${escapeHtml(label)}</div>
        </div>
      </div>
      ${actionHtml}
    </div>`;
  }

  private stateDisplay(state: string): { icon: string; label: string; cssClass: string } {
    switch (state) {
      case 'connected':
        return { icon: '&#x2705;', label: vscode.l10n.t('Connected'), cssClass: 'state-connected' };
      case 'unauthenticated':
        return { icon: '&#x26A0;&#xFE0F;', label: vscode.l10n.t('Needs Authentication'), cssClass: 'state-auth' };
      case 'unavailable':
        return { icon: '&#x2B24;', label: vscode.l10n.t('Not Installed'), cssClass: 'state-missing' };
      default:
        return { icon: '&#x2014;', label: vscode.l10n.t('Unknown'), cssClass: 'state-unknown' };
    }
  }

  private renderAction(def: IntegrationDef, status: IntegrationStatus | undefined): string {
    if (!status) {
      return '';
    }

    if (def.id === 'xcsh' && status.state === 'unauthenticated') {
      return `<div class="card-action">
        <code>${vscode.l10n.t('Add F5 XC Context')}</code>
        <button class="btn-run" data-action="addContext">${vscode.l10n.t('Configure')}</button>
      </div>`;
    }

    if (!status.command) {
      return '';
    }

    return `<div class="card-action">
      <code>${escapeHtml(status.command)}</code>
      <div class="action-buttons">
        <button class="btn-copy" data-action="copy" data-text="${escapeHtml(status.command)}">${vscode.l10n.t('Copy')}</button>
        <button class="btn-run" data-action="run" data-text="${escapeHtml(status.command)}">${vscode.l10n.t('Run')}</button>
      </div>
    </div>`;
  }

  private getStyles(): string {
    return `
    ${getWebviewBaseStyles()}

    .hero {
      padding: 20px 24px 16px;
      text-align: center;
    }
    .hero-stat {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 10px;
      color: var(--vscode-foreground);
    }
    .progress-bar {
      height: 8px;
      border-radius: 4px;
      background: var(--vscode-panel-border);
      overflow: hidden;
      max-width: 480px;
      margin: 0 auto;
    }
    .progress-fill {
      height: 100%;
      background: var(--f5-brand-red);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .container { padding: 0 24px 24px; }

    .category-section { margin-bottom: 16px; }
    .category-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      padding: 8px 0 6px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 10px;
    }

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: var(--vscode-focusBorder); }

    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-badge {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 11px;
      flex-shrink: 0;
      letter-spacing: -0.3px;
    }
    .card-info { flex: 1; min-width: 0; }
    .card-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }
    .card-status {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .state-connected .card-status,
    .card-status.state-connected { color: var(--vscode-testing-iconPassed, #73c991); }
    .state-auth .card-status,
    .card-status.state-auth { color: var(--vscode-editorWarning-foreground, #cca700); }
    .state-missing .card-status,
    .card-status.state-missing { color: var(--vscode-editorError-foreground, #f14c4c); }

    .card-action {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
      border-radius: 4px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .card-action code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      flex: 1;
      word-break: break-all;
      color: var(--vscode-foreground);
    }
    .action-buttons {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .btn-copy, .btn-run {
      padding: 3px 10px;
      font-size: 11px;
      cursor: pointer;
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      font-family: var(--vscode-font-family);
    }
    .btn-copy {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-copy:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-run {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-run:hover { background: var(--vscode-button-hoverBackground); }
    `;
  }
}
