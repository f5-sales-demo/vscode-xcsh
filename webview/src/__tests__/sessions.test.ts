// webview/src/__tests__/sessions.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

type SessionsModule = {
  subscribe: (fn: () => void) => () => void;
  getSessions: () => Array<{ id: string }>;
  getActiveSession: () => { id: string } | null;
  createNewSession: () => { id: string };
};

function loadSessions(): SessionsModule {
  return require('../state/sessions') as SessionsModule;
}

describe('sessions manager', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('createNewSession creates and activates a session', () => {
    const { createNewSession, getActiveSession, getSessions } = loadSessions();
    const session = createNewSession();
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(getActiveSession()).toBe(session);
    expect(getSessions()).toContain(session);
  });

  it('subscribe notifies on session changes', () => {
    const { createNewSession, subscribe } = loadSessions();
    const calls: number[] = [];
    const unsub = subscribe(() => calls.push(1));
    createNewSession();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it('multiple sessions are tracked', () => {
    const { createNewSession, getActiveSession, getSessions } = loadSessions();
    const s1 = createNewSession();
    const s2 = createNewSession();
    expect(getSessions()).toContain(s1);
    expect(getSessions()).toContain(s2);
    expect(getActiveSession()).toBe(s2);
  });
});
