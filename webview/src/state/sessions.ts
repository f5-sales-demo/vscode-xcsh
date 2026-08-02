// webview/src/state/sessions.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { createSession, type Session } from './session';

let activeSession: Session | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveSession(): Session | null {
  return activeSession;
}

export function createNewSession(): Session {
  const session = createSession();
  activeSession = session;
  notify();
  return session;
}
