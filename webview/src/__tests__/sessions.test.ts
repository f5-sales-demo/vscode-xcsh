// webview/src/__tests__/sessions.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

type SessionsModule = typeof import('../state/sessions');

function loadSessions(): SessionsModule {
  return require('../state/sessions') as SessionsModule;
}

describe('sessions manager', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('createNewSession creates and activates a session', () => {
    const { createNewSession, getActiveSession } = loadSessions();
    const session = createNewSession();
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(getActiveSession()).toBe(session);
  });

  it('subscribe notifies on session changes', () => {
    const { createNewSession, subscribe } = loadSessions();
    const calls: number[] = [];
    const unsub = subscribe(() => calls.push(1));
    createNewSession();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it('the most recently created session becomes active', () => {
    const { createNewSession, getActiveSession } = loadSessions();
    createNewSession();
    const s2 = createNewSession();
    expect(getActiveSession()).toBe(s2);
  });
});
