// webview/src/__tests__/session.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { AssistantMessage, TextBlock } from '../state/session';
import { createSession } from '../state/session';

describe('session state', () => {
  it('creates a session with default values', () => {
    const session = createSession();
    expect(session.id).toBeDefined();
    expect(session.messages).toEqual([]);
    expect(session.busy).toBe(false);
    expect(session.error).toBeNull();
    expect(session.summary).toBe('Untitled');
  });

  it('subscribe and notify work', () => {
    const session = createSession();
    const calls: number[] = [];
    session.subscribe(() => calls.push(1));
    session.notify();
    expect(calls).toEqual([1]);
  });

  it('addUserMessage pushes a user message', () => {
    const session = createSession();
    session.addUserMessage('hello');
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toEqual({ type: 'user', text: 'hello' });
  });

  it('appendAssistantText creates or appends to assistant message', () => {
    const session = createSession();
    session.appendAssistantText('first');
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toEqual({
      type: 'assistant',
      blocks: [{ type: 'text', text: 'first' }],
    });

    session.appendAssistantText(' second');
    expect(session.messages).toHaveLength(1);
    const block = (session.messages[0] as unknown as AssistantMessage).blocks[0] as TextBlock;
    expect(block.text).toBe('first second');
  });

  it('addToolStart adds a tool_use block', () => {
    const session = createSession();
    session.appendAssistantText('text before');
    session.addToolStart('read_file', 'call-1');
    const lastMsg = session.messages[session.messages.length - 1] as unknown as AssistantMessage;
    expect(lastMsg.blocks).toHaveLength(2);
    expect(lastMsg.blocks[1]).toEqual({
      type: 'tool_use',
      toolName: 'read_file',
      toolCallId: 'call-1',
      running: true,
    });
  });

  it('endTurn sets busy to false', () => {
    const session = createSession();
    session.busy = true;
    session.endTurn();
    expect(session.busy).toBe(false);
  });

  it('unsubscribe stops notifications', () => {
    const session = createSession();
    const calls: number[] = [];
    const unsub = session.subscribe(() => calls.push(1));
    unsub();
    session.notify();
    expect(calls).toEqual([]);
  });
});

describe('cited sources (xcsh #2420 references event)', () => {
  it('attaches citations to the assistant message that cited them', () => {
    const s = createSession();
    s.addUserMessage('which LB?');
    s.appendAssistantText('Use an HTTP LB.');
    s.setReferences([{ kind: 'doc', title: 'HTTP LB', url: 'https://docs.cloud.f5.com/lb' }]);

    const assistant = s.messages.find((m) => m.type === 'assistant');
    expect(assistant?.type).toBe('assistant');
    if (assistant?.type !== 'assistant') {
      throw new Error('expected an assistant message');
    }
    expect(assistant.references).toEqual([{ kind: 'doc', title: 'HTTP LB', url: 'https://docs.cloud.f5.com/lb' }]);
  });

  it('attaches to the LATEST assistant message, so an earlier turn keeps its own sources', () => {
    const s = createSession();
    s.addUserMessage('first');
    s.appendAssistantText('one');
    s.setReferences([{ kind: 'doc', title: 'First', url: 'https://d/1' }]);
    s.endTurn();
    s.addUserMessage('second');
    s.appendAssistantText('two');
    s.setReferences([{ kind: 'doc', title: 'Second', url: 'https://d/2' }]);

    const assistants = s.messages.filter((m) => m.type === 'assistant');
    expect(assistants).toHaveLength(2);
    if (assistants[0].type !== 'assistant' || assistants[1].type !== 'assistant') {
      throw new Error('shape');
    }
    expect(assistants[0].references?.[0].title).toBe('First');
    expect(assistants[1].references?.[0].title).toBe('Second');
  });

  it('is a no-op when there is no assistant message yet (a stray event cannot crash the view)', () => {
    const s = createSession();
    expect(() => s.setReferences([{ kind: 'doc', title: 'x', url: 'https://d/x' }])).not.toThrow();
    expect(s.messages).toHaveLength(0);
  });
});
