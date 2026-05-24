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
      .getState()
      .then((state) => {
        void view.webview.postMessage({
          type: 'from-extension',
          message: {
            type: 'welcome_state',
            version: 'v18.77.0',
            model: state.model?.name ?? state.model?.modelId ?? 'unknown',
            modelProvider: state.model?.provider ?? 'anthropic',
            integrations: [
              { name: 'F5 XC Context', connected: true },
              { name: 'GitLab', connected: true },
              { name: 'GitHub', connected: true },
              { name: 'Salesforce', connected: true },
              { name: 'Azure', connected: true },
              { name: 'AWS', connected: true },
              { name: 'Google Cloud', connected: true },
            ],
          },
        });
      })
      .catch(() => {
        void view.webview.postMessage({
          type: 'from-extension',
          message: {
            type: 'welcome_state',
            version: 'v18.77.0',
            modelProvider: 'anthropic',
            integrations: [],
          },
        });
      });
  }

  private handleWebviewMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case 'prompt': {
        const text = msg.text as string | undefined;
        if (text) {
          this.rpcBridge.prompt(text);
        }
        break;
      }
      case 'abort':
        this.rpcBridge.abort();
        break;
      default:
        break;
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
