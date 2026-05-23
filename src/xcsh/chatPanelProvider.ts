// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { MessageUpdate, ToolExecutionEnd, ToolExecutionStart } from './types';

/**
 * WebviewViewProvider for the xcsh Chat panel in the sidebar.
 *
 * Renders a simple chat interface with a message list, input textarea,
 * and tool execution blocks. Communicates with the extension host via
 * postMessage to send prompts and receive streamed responses.
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'f5xc.xcshChat';

  private readonly logger = getLogger();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly rpcBridge: XcshRpcBridge,
  ) {}

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

    // Handle messages from the webview
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: { type: string; text?: string }) => {
        if (message.type === 'prompt' && message.text) {
          this.rpcBridge.prompt(message.text);
        } else if (message.type === 'abort') {
          this.rpcBridge.abort();
        }
      }),
    );

    // Stream RPC events to the webview
    this.disposables.push(
      this.rpcBridge.onEvent<MessageUpdate>('message_update', (event) => {
        void webviewView.webview.postMessage({
          type: 'message_update',
          text: event.text,
        });
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
        void webviewView.webview.postMessage({
          type: 'tool_end',
          toolCallId: event.toolCallId,
        });
      }),
    );

    this.disposables.push(
      this.rpcBridge.onEvent('stream_end', () => {
        void webviewView.webview.postMessage({ type: 'stream_end' });
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xcsh Chat</title>
  <style>
    :root {
      --font-family: var(--vscode-font-family, system-ui, sans-serif);
      --font-size: var(--vscode-font-size, 13px);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      font-size: var(--font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .message {
      margin-bottom: 12px;
      line-height: 1.5;
    }
    .message.user {
      color: var(--vscode-textLink-foreground);
      font-weight: 600;
    }
    .message.assistant {
      color: var(--vscode-foreground);
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .tool-block {
      margin: 4px 0;
      padding: 4px 8px;
      background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1));
      border-left: 3px solid var(--vscode-textLink-foreground);
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    .tool-block.running::after {
      content: ' ...';
      animation: dots 1.5s steps(3, end) infinite;
    }
    @keyframes dots {
      0% { content: ''; }
      33% { content: '.'; }
      66% { content: '..'; }
      100% { content: '...'; }
    }
    #input-area {
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 4px;
    }
    #prompt-input {
      flex: 1;
      resize: none;
      padding: 6px 8px;
      font-family: var(--font-family);
      font-size: var(--font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      min-height: 36px;
      max-height: 120px;
    }
    #prompt-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    #send-btn {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: var(--font-size);
    }
    #send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
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
    let currentAssistantEl = null;

    function addUserMessage(text) {
      const div = document.createElement('div');
      div.className = 'message user';
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function ensureAssistantMessage() {
      if (!currentAssistantEl) {
        currentAssistantEl = document.createElement('div');
        currentAssistantEl.className = 'message assistant';
        messagesEl.appendChild(currentAssistantEl);
      }
      return currentAssistantEl;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      addUserMessage(text);
      currentAssistantEl = null;
      vscode.postMessage({ type: 'prompt', text });
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    // Auto-resize textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'message_update': {
          const el = ensureAssistantMessage();
          el.textContent += msg.text;
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }
        case 'tool_start': {
          const block = document.createElement('div');
          block.className = 'tool-block running';
          block.id = 'tool-' + msg.toolCallId;
          block.textContent = 'Running ' + msg.toolName;
          messagesEl.appendChild(block);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          break;
        }
        case 'tool_end': {
          const block = document.getElementById('tool-' + msg.toolCallId);
          if (block) block.classList.remove('running');
          break;
        }
        case 'stream_end': {
          currentAssistantEl = null;
          break;
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
