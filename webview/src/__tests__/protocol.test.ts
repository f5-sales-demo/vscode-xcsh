// webview/src/__tests__/protocol.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

describe('webview protocol', () => {
  let mockPostMessage: jest.Mock;
  let messageHandler: ((event: MessageEvent) => void) | null;

  beforeEach(() => {
    jest.resetModules();
    mockPostMessage = jest.fn();
    messageHandler = null;

    (globalThis as unknown as Record<string, unknown>).acquireVsCodeApi = () => ({
      postMessage: mockPostMessage,
      getState: () => ({}),
      setState: jest.fn(),
    });

    jest.spyOn(window, 'addEventListener').mockImplementation((type: string, handler: unknown) => {
      if (type === 'message') {
        messageHandler = handler as (event: MessageEvent) => void;
      }
    });
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).acquireVsCodeApi;
    jest.restoreAllMocks();
  });

  function loadProtocol() {
    return require('../protocol') as {
      initProtocol: () => void;
      on: (type: string, callback: (msg: Record<string, unknown>) => void) => () => void;
      sendPrompt: (text: string) => void;
      sendAbort: () => void;
      sendSetMode: (mode: string) => void;
      sendSetThinking: (level: string) => void;
      sendRequestAttachment: (category: string) => void;
    };
  }

  function dispatchFromExtension(data: unknown, overrides: Partial<MessageEvent> = {}): void {
    messageHandler?.({
      data,
      source: window,
      origin: window.location.origin,
      ...overrides,
    } as MessageEvent);
  }

  it('sendPrompt posts message via vscode API', () => {
    const { initProtocol, sendPrompt } = loadProtocol();
    initProtocol();
    sendPrompt('hello');
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'prompt', text: 'hello' });
  });

  it('on registers listener and receives events', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();

    const received: unknown[] = [];
    on('message_update', (msg) => received.push(msg));

    dispatchFromExtension({ type: 'from-extension', message: { type: 'message_update', text: 'chunk' } });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'message_update', text: 'chunk' });
  });

  it('accepts extension-host events relayed by the outer VS Code webview frame', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();

    const received: unknown[] = [];
    on('message_update', (msg) => received.push(msg));

    dispatchFromExtension(
      { type: 'from-extension', message: { type: 'message_update', text: 'chunk' } },
      { source: {} as MessageEventSource },
    );

    expect(received).toEqual([{ type: 'message_update', text: 'chunk' }]);
  });

  it('on returns unsubscribe function', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();

    const received: unknown[] = [];
    const unsub = on('message_update', (msg) => received.push(msg));
    unsub();

    dispatchFromExtension({ type: 'from-extension', message: { type: 'message_update', text: 'chunk' } });

    expect(received).toHaveLength(0);
  });

  it('sendSetMode posts set_mode message with mode', () => {
    const { initProtocol, sendSetMode } = loadProtocol();
    initProtocol();
    sendSetMode('confirm');
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'set_mode', mode: 'confirm' });
  });

  it('sendSetThinking posts set_thinking message with level', () => {
    const { initProtocol, sendSetThinking } = loadProtocol();
    initProtocol();
    sendSetThinking('high');
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'set_thinking', level: 'high' });
  });

  it('sendRequestAttachment posts request_attachment with category', () => {
    const { initProtocol, sendRequestAttachment } = loadProtocol();
    initProtocol();
    sendRequestAttachment('problems');
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'request_attachment', category: 'problems' });
  });

  it('on dispatches attachment_added payloads', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();
    const received: unknown[] = [];
    on('attachment_added', (msg) => received.push(msg));
    const attachment = { id: '1', kind: 'file', label: 'a.ts', dedupKey: 'file:a.ts', content: 'x', path: 'a.ts' };
    dispatchFromExtension({ type: 'from-extension', message: { type: 'attachment_added', attachment } });
    expect(received).toEqual([{ type: 'attachment_added', attachment }]);
  });

  it('rejects messages from a forged origin', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();
    const received: unknown[] = [];
    on('message_update', (msg) => received.push(msg));
    const data = { type: 'from-extension', message: { type: 'message_update', text: 'chunk' } };

    dispatchFromExtension(data, { origin: 'https://attacker.example' });

    expect(received).toEqual([]);
  });

  it.each([
    null,
    'from-extension',
    { type: 'from-extension' },
    { type: 'from-extension', message: null },
    { type: 'from-extension', message: { type: '' } },
    { type: 'from-extension', message: { type: 7 } },
  ])('rejects malformed extension envelopes: %p', (data) => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();
    const received: unknown[] = [];
    on('*', (msg) => received.push(msg));

    dispatchFromExtension(data);

    expect(received).toEqual([]);
  });
});
