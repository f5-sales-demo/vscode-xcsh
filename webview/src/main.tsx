// webview/src/main.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import ReactDOM from 'react-dom/client';
import { SessionView } from './components/SessionView';
import { setL10nBundle } from './lib/i18n';
import type { ExtensionMessage } from './lib/protocol';
import { initProtocol, on } from './lib/protocol';
import { createNewSession, getActiveSession } from './state/sessions';
import './styles/webview.css';

// Initialize protocol and session
initProtocol();
createNewSession();

function handleMessageUpdate(msg: ExtensionMessage): void {
  const session = getActiveSession();
  if (session && typeof msg.text === 'string') {
    session.appendAssistantText(msg.text);
  }
}

function handleToolStart(msg: ExtensionMessage): void {
  const session = getActiveSession();
  if (session && typeof msg.toolName === 'string' && typeof msg.toolCallId === 'string') {
    session.addToolStart(msg.toolName, msg.toolCallId);
  }
}

function handleToolEnd(msg: ExtensionMessage): void {
  const session = getActiveSession();
  if (session && typeof msg.toolCallId === 'string') {
    session.endToolUse(msg.toolCallId);
  }
}

function handleTurnEnd(): void {
  const session = getActiveSession();
  if (session) {
    session.endTurn();
  }
}

function handleL10nBundle(msg: ExtensionMessage): void {
  if (msg.strings && typeof msg.strings === 'object') {
    setL10nBundle(msg.strings as Record<string, string>);
  }
}

on('message_update', handleMessageUpdate);
on('tool_execution_start', handleToolStart);
on('tool_execution_end', handleToolEnd);
on('turn_end', handleTurnEnd);
on('l10n_bundle', handleL10nBundle);

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<SessionView />);
}
