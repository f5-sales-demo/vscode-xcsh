// webview/src/state/sessions.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { createSession, type Session } from './session';

const sessions: Session[] = [];
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

export function getSessions(): Session[] {
  return sessions;
}

export function getActiveSession(): Session | null {
  return activeSession;
}

export function createNewSession(): Session {
  const session = createSession();
  sessions.unshift(session);
  activeSession = session;
  notify();
  return session;
}

export function activateSession(session: Session): void {
  activeSession = session;
  notify();
}
