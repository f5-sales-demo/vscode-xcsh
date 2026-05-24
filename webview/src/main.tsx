// webview/src/main.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import ReactDOM from 'react-dom/client';
import { SessionView } from './components/SessionView';
import type { ExtensionMessage } from './lib/protocol';
import { initProtocol, on } from './lib/protocol';
import { createNewSession, getActiveSession } from './state/sessions';
import './styles/webview.css';

interface WelcomeState {
  version?: string;
  model?: string;
  modelProvider?: string;
  integrations?: Array<{ name: string; connected: boolean }>;
}

// Welcome state store
export let welcomeState: WelcomeState = {};

const welcomeListeners = new Set<() => void>();

export function subscribeWelcome(fn: () => void): () => void {
  welcomeListeners.add(fn);
  return () => welcomeListeners.delete(fn);
}

export function getWelcomeState(): WelcomeState {
  return welcomeState;
}

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

function handleWelcomeState(msg: ExtensionMessage): void {
  welcomeState = msg as unknown as WelcomeState;
  for (const fn of welcomeListeners) {
    fn();
  }
}

on('message_update', handleMessageUpdate);
on('tool_execution_start', handleToolStart);
on('tool_execution_end', handleToolEnd);
on('turn_end', handleTurnEnd);
on('welcome_state', handleWelcomeState);

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<SessionView />);
}
