// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { marked } from 'marked';
import type * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { ToolExecutionEnd, ToolExecutionStart } from './types';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'f5xc.xcshChat';

  private readonly logger = getLogger();
  private readonly disposables: vscode.Disposable[] = [];
  private mdBuffer = '';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly rpcBridge: XcshRpcBridge,
  ) {
    marked.setOptions({ gfm: true, breaks: true });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: { type: string; text?: string }) => {
        if (message.type === 'prompt' && message.text) {
          this.mdBuffer = '';
          this.rpcBridge.prompt(message.text);
        } else if (message.type === 'abort') {
          this.rpcBridge.abort();
        }
      }),
    );

    this.disposables.push(
      this.rpcBridge.onMessageStream((event) => {
        this.mdBuffer += event.text;
        const rendered = marked.parse(this.mdBuffer) as string;
        void webviewView.webview.postMessage({ type: 'message_html', html: rendered });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent<ToolExecutionStart>('tool_execution_start', (event) => {
        void webviewView.webview.postMessage({
          type: 'tool_start',
          toolName: event.toolName,
          toolCallId: event.toolCallId,
        });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent<ToolExecutionEnd>('tool_execution_end', (event) => {
        void webviewView.webview.postMessage({ type: 'tool_end', toolCallId: event.toolCallId });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent('turn_end', () => {
        this.mdBuffer = '';
        void webviewView.webview.postMessage({ type: 'turn_end' });
      }),
    );

    webviewView.onDidDispose(() => {
      for (const d of this.disposables) {
        d.dispose();
      }
      this.disposables.length = 0;
    });

    this.logger.info('xcsh chat panel resolved');
  }

  private getHtmlContent(): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xcsh Chat</title>
  <style>
    :root {
      --font: var(--vscode-font-family, system-ui, sans-serif);
      --mono: var(--vscode-editor-font-family, 'SF Mono', Menlo, monospace);
      --size: var(--vscode-font-size, 13px);
      --fg: var(--vscode-foreground);
      --bg: var(--vscode-sideBar-background);
      --link: var(--vscode-textLink-foreground);
      --border: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --code-bg: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15));
      --tbl-border: var(--vscode-editorGroup-border, rgba(127,127,127,0.25));
      --quote-bg: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1));
      --desc: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font); font-size: var(--size); color: var(--fg); background: var(--bg); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    #messages { flex: 1; overflow-y: auto; padding: 10px 12px; scroll-behavior: smooth; }
    .msg { margin-bottom: 16px; line-height: 1.6; animation: fadeIn 0.15s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .msg.user { color: var(--link); font-weight: 600; padding: 6px 10px; background: rgba(127,127,127,0.06); border-radius: 6px; }
    .msg.assistant { color: var(--fg); }
    .msg.assistant h1 { font-size: 1.4em; font-weight: 700; margin: 12px 0 6px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .msg.assistant h2 { font-size: 1.2em; font-weight: 700; margin: 10px 0 4px; }
    .msg.assistant h3 { font-size: 1.05em; font-weight: 600; margin: 8px 0 4px; }
    .msg.assistant p { margin: 4px 0; }
    .msg.assistant ul, .msg.assistant ol { margin: 4px 0 4px 20px; }
    .msg.assistant li { margin: 2px 0; }
    .msg.assistant strong { font-weight: 700; }
    .msg.assistant a { color: var(--link); text-decoration: none; }
    .msg.assistant a:hover { text-decoration: underline; }
    .msg.assistant code { font-family: var(--mono); font-size: 0.9em; background: var(--code-bg); padding: 1px 5px; border-radius: 3px; }
    .msg.assistant pre { background: var(--code-bg); border-radius: 6px; padding: 10px 12px; margin: 6px 0; overflow-x: auto; border: 1px solid var(--tbl-border); }
    .msg.assistant pre code { background: none; padding: 0; font-size: 0.88em; line-height: 1.5; }
    .msg.assistant table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.92em; border: 1px solid var(--tbl-border); }
    .msg.assistant th { background: var(--code-bg); font-weight: 600; text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--tbl-border); }
    .msg.assistant td { padding: 5px 10px; border-bottom: 1px solid var(--tbl-border); }
    .msg.assistant tr:last-child td { border-bottom: none; }
    .msg.assistant tr:hover td { background: rgba(127,127,127,0.05); }
    .msg.assistant blockquote { border-left: 3px solid var(--link); padding: 4px 12px; margin: 6px 0; background: var(--quote-bg); border-radius: 0 4px 4px 0; color: var(--desc); }
    .msg.assistant hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
    .tool-block { margin: 6px 0; padding: 5px 10px; background: var(--quote-bg); border-left: 3px solid var(--link); border-radius: 0 4px 4px 0; font-size: 0.88em; color: var(--desc); font-family: var(--mono); }
    .tool-block.running::after { content: ' \\2026'; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    #input-area { padding: 8px 12px; border-top: 1px solid var(--border); display: flex; gap: 6px; }
    #prompt-input { flex: 1; resize: none; padding: 8px 10px; font-family: var(--font); font-size: var(--size); color: var(--input-fg); background: var(--input-bg); border: 1px solid var(--tbl-border); border-radius: 6px; min-height: 38px; max-height: 120px; }
    #prompt-input:focus { outline: none; border-color: var(--link); }
    #send-btn { padding: 8px 16px; background: var(--btn-bg); color: var(--btn-fg); border: none; border-radius: 6px; cursor: pointer; font-size: var(--size); font-weight: 600; transition: background 0.15s; }
    #send-btn:hover { background: var(--btn-hover); }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="prompt-input" rows="1" placeholder="Ask xcsh..."></textarea>
    <button id="send-btn">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('prompt-input');
    const sendBtn = document.getElementById('send-btn');
    let currentEl = null;

    function addUser(text) {
      const d = document.createElement('div');
      d.className = 'msg user';
      d.textContent = text;
      messagesEl.appendChild(d);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function ensureAssistant() {
      if (!currentEl) {
        currentEl = document.createElement('div');
        currentEl.className = 'msg assistant';
        messagesEl.appendChild(currentEl);
      }
      return currentEl;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      addUser(text);
      currentEl = null;
      vscode.postMessage({ type: 'prompt', text });
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'message_html': {
          const el = ensureAssistant();
          const tpl = document.createElement('template');
          tpl.innerHTML = msg.html;
          el.textContent = '';
          el.appendChild(tpl.content.cloneNode(true));
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }
        case 'tool_start': {
          const b = document.createElement('div');
          b.className = 'tool-block running';
          b.id = 'tool-' + msg.toolCallId;
          b.textContent = msg.toolName;
          messagesEl.appendChild(b);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }
        case 'tool_end': {
          const b = document.getElementById('tool-' + msg.toolCallId);
          if (b) b.classList.remove('running');
          break;
        }
        case 'turn_end': {
          currentEl = null;
          break;
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
