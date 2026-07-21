// webview/src/__tests__/sessionTranscript.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { createSession, serializeSessionTranscript } from '../state/session';

describe('serializeSessionTranscript', () => {
  it('renders user text, assistant text, and tool-use markers', () => {
    const s = createSession();
    s.addUserMessage('hello');
    s.appendAssistantText('hi there');
    s.addToolStart('vscode_read_file', '1');
    const out = serializeSessionTranscript(s);
    expect(out).toContain('User: hello');
    expect(out).toContain('hi there');
    expect(out).toContain('[tool: vscode_read_file]');
  });

  it('returns an empty string for a session with no messages', () => {
    expect(serializeSessionTranscript(createSession())).toBe('');
  });
});
