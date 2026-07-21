// src/xcsh/panelProvider.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import { MAX_ATTACHMENT_BYTES } from './attachment';
import { resolveAttachments } from './attachmentResolvers';
import type { Attachment, FileAttachment, HostAttachmentCategory } from './attachmentTypes';
import type { XcshRpcBridge } from './rpcBridge';
import type { MessageUpdate, ToolExecutionEnd, ToolExecutionStart } from './types';

export class XcshPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'xcsh.xcshPanel';
  static readonly viewTypeSecondary = 'xcsh.xcshPanelSecondary';

  private readonly logger = getLogger();
  private readonly disposables: vscode.Disposable[] = [];
  private webviewView: vscode.WebviewView | null = null;
  /** True once the React app has mounted and registered its message listeners. */
  private webviewReady = false;
  /**
   * Attachments awaiting delivery to the chat input. Buffered until the webview
   * signals `webview_ready`, so an attachment injected while the panel is
   * opening (focus → resolve → mount) is not lost to the load race.
   */
  private pendingAttachments: Attachment[] = [];

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
    this.webviewReady = false;
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

    this.sendL10nBundle();
    this.sendLocale();

    webviewView.onDidDispose(() => {
      this.webviewView = null;
      this.webviewReady = false;
      for (const d of this.disposables) {
        d.dispose();
      }
      this.disposables.length = 0;
    });

    this.logger.info('xcsh panel resolved');
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
      case 'request_attachment': {
        const category = msg.category as HostAttachmentCategory | undefined;
        if (category) {
          void this.handleAttachmentRequest(category);
        }
        break;
      }
      case 'webview_ready': {
        // The React app has mounted and its listeners are live. Flush anything
        // buffered while the panel was opening, and re-send the l10n bundle
        // (posted during resolve, it can race the listener registration).
        this.webviewReady = true;
        this.sendL10nBundle();
        this.flushPendingAttachments();
        break;
      }
      default:
        break;
    }
  }

  /**
   * Inject content into the chat input as a context attachment (a removable
   * chip folded into the next prompt). Used by the resource webview button and
   * the tree "Add to xcsh chat" command. Callers should focus the panel first
   * so the webview resolves; delivery is buffered until the webview is ready.
   */
  attachContext(name: string, content: string): void {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_ATTACHMENT_BYTES) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          'Content too large to attach ({0}KB). Maximum is {1}KB.',
          Math.round(bytes / 1024),
          Math.round(MAX_ATTACHMENT_BYTES / 1024),
        ),
      );
      return;
    }
    const attachment: FileAttachment = {
      id: randomUUID(),
      kind: 'file',
      label: name,
      dedupKey: `file:${name}`,
      content,
      path: name,
    };
    this.postAttachment(attachment);
  }

  /** Buffer an attachment and flush it to the webview once it is ready. */
  private postAttachment(attachment: Attachment): void {
    this.pendingAttachments.push(attachment);
    this.flushPendingAttachments();
  }

  /** Post any buffered attachments to the webview once it is live and ready. */
  private flushPendingAttachments(): void {
    const view = this.webviewView;
    if (!view || !this.webviewReady || this.pendingAttachments.length === 0) {
      return;
    }
    const pending = this.pendingAttachments;
    this.pendingAttachments = [];
    for (const attachment of pending) {
      void view.webview.postMessage({
        type: 'from-extension',
        message: { type: 'attachment_added', attachment },
      });
    }
  }

  /** Run the picker for a category and deliver each resolved attachment. */
  private async handleAttachmentRequest(category: HostAttachmentCategory): Promise<void> {
    try {
      const attachments = await resolveAttachments(category);
      for (const attachment of attachments) {
        this.postAttachment(attachment);
      }
    } catch (err) {
      this.logger.error(
        `Failed to resolve ${category} attachment: ${err instanceof Error ? err.message : String(err)}`,
      );
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
