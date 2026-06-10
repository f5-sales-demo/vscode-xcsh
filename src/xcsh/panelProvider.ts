// src/xcsh/panelProvider.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { MessageUpdate, ToolExecutionEnd, ToolExecutionStart } from './types';

export class XcshPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'f5xc.xcshPanel';
  static readonly viewTypeSecondary = 'f5xc.xcshPanelSecondary';

  private readonly logger = getLogger();
  private readonly disposables: vscode.Disposable[] = [];
  private webviewView: vscode.WebviewView | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly rpcBridge: XcshRpcBridge,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewView = webviewView;
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [distPath],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview, distPath);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((msg: { type: string; [key: string]: unknown }) => {
        this.handleWebviewMessage(msg);
      }),
    );

    this.disposables.push(
      this.rpcBridge.onMessageStream((event: MessageUpdate) => {
        void webviewView.webview.postMessage({
          type: 'from-extension',
          message: { type: 'message_update', text: event.text },
        });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent<ToolExecutionStart>('tool_execution_start', (event) => {
        void webviewView.webview.postMessage({
          type: 'from-extension',
          message: { type: 'tool_execution_start', toolName: event.toolName, toolCallId: event.toolCallId },
        });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent<ToolExecutionEnd>('tool_execution_end', (event) => {
        void webviewView.webview.postMessage({
          type: 'from-extension',
          message: { type: 'tool_execution_end', toolCallId: event.toolCallId },
        });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent('turn_end', () => {
        void webviewView.webview.postMessage({
          type: 'from-extension',
          message: { type: 'turn_end' },
        });
      }),
    );

    this.sendWelcomeState();
    this.sendL10nBundle();
    this.sendLocale();

    webviewView.onDidDispose(() => {
      this.webviewView = null;
      for (const d of this.disposables) {
        d.dispose();
      }
      this.disposables.length = 0;
    });

    this.logger.info('xcsh panel resolved');
  }

  private sendWelcomeState(): void {
    const view = this.webviewView;
    if (!view) {
      return;
    }

    this.rpcBridge
      .getIntegrations()
      .then((data) => {
        void view.webview.postMessage({
          type: 'from-extension',
          message: {
            type: 'welcome_state',
            version: `v${data.version}`,
            model: data.model.provider ?? 'unknown',
            modelProvider: data.model.state === 'connected' ? data.model.provider : undefined,
            integrations: data.services,
          },
        });
      })
      .catch(() => {
        this.rpcBridge
          .getState()
          .then((state) => {
            void view.webview.postMessage({
              type: 'from-extension',
              message: {
                type: 'welcome_state',
                version: 'xcsh',
                model: state.model?.name ?? state.model?.modelId ?? 'unknown',
                modelProvider: state.model?.provider ?? 'anthropic',
                integrations: [],
              },
            });
          })
          .catch(() => {
            void view.webview.postMessage({
              type: 'from-extension',
              message: {
                type: 'welcome_state',
                integrations: [],
              },
            });
          });
      });
  }

  private sendLocale(): void {
    this.rpcBridge.setLocale(vscode.env.language).catch(() => {
      this.logger.warn('Failed to set locale on xcsh (may not support set_locale yet)');
    });
  }

  private sendL10nBundle(): void {
    const view = this.webviewView;
    if (!view) {
      return;
    }
    const bundlePath = path.join(this.extensionUri.fsPath, 'l10n', `bundle.l10n.${vscode.env.language}.json`);
    let strings: Record<string, string> = {};
    try {
      if (fs.existsSync(bundlePath)) {
        strings = JSON.parse(fs.readFileSync(bundlePath, 'utf-8')) as Record<string, string>;
      }
    } catch {
      this.logger.warn('Failed to load l10n bundle for webview');
    }
    void view.webview.postMessage({
      type: 'from-extension',
      message: { type: 'l10n_bundle', strings },
    });
  }

  private handleWebviewMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case 'prompt': {
        const text = msg.text as string | undefined;
        if (text) {
          this.rpcBridge.prompt(text, { locale: vscode.env.language });
        }
        break;
      }
      case 'abort':
        this.rpcBridge.abort();
        break;
      case 'set_mode': {
        const mode = msg.mode as string | undefined;
        if (mode) {
          this.rpcBridge.sendCommand({ type: 'set_permission_mode', mode }).catch(() => {});
        }
        break;
      }
      case 'set_thinking': {
        const level = msg.level as string | undefined;
        if (level) {
          this.rpcBridge.sendCommand({ type: 'set_thinking_level', level }).catch(() => {});
        }
        break;
      }
      case 'request_file_picker': {
        void this.handleFilePicker();
        break;
      }
      default:
        break;
    }
  }

  private async handleFilePicker(): Promise<void> {
    const view = this.webviewView;
    if (!view) {
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Attach',
      filters: {
        'Text Files': [
          'ts',
          'tsx',
          'js',
          'jsx',
          'json',
          'yaml',
          'yml',
          'md',
          'txt',
          'csv',
          'xml',
          'html',
          'css',
          'py',
          'go',
          'rs',
          'sh',
          'bash',
          'zsh',
          'toml',
          'ini',
          'cfg',
          'conf',
          'env',
          'log',
        ],
        'All Files': ['*'],
      },
    });

    if (!uris || uris.length === 0) {
      return;
    }

    const uri = uris[0];
    if (!uri) {
      return;
    }
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const maxSize = 512 * 1024;
      if (stat.size > maxSize) {
        void vscode.window.showWarningMessage(
          `File too large to attach (${Math.round(stat.size / 1024)}KB). Maximum is 512KB.`,
        );
        return;
      }
      const content = await vscode.workspace.fs.readFile(uri);
      const name = path.basename(uri.fsPath);
      void view.webview.postMessage({
        type: 'from-extension',
        message: {
          type: 'file_attached',
          name,
          content: new TextDecoder().decode(content),
        },
      });
    } catch {
      this.logger.error('Failed to read attached file');
    }
  }

  private getHtmlContent(webview: vscode.Webview, distPath: vscode.Uri): string {
    const indexPath = path.join(distPath.fsPath, 'index.html');

    try {
      let html = fs.readFileSync(indexPath, 'utf-8');

      const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'assets'));
      html = html.replace(/\/assets\//g, `${assetUri.toString()}/`);
      html = html.replace(
        /<head>/,
        `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">`,
      );

      return html;
    } catch {
      return '<!DOCTYPE html><html><body><p>xcsh webview not built. Run <code>npm run build:webview</code>.</p></body></html>';
    }
  }
}
