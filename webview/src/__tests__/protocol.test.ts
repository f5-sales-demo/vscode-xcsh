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
    return require('../lib/protocol') as {
      initProtocol: () => void;
      send: (msg: unknown) => void;
      on: (type: string, callback: (msg: Record<string, unknown>) => void) => () => void;
      sendPrompt: (text: string) => void;
      sendAbort: () => void;
      sendSetMode: (mode: string) => void;
      sendSetThinking: (level: string) => void;
      sendRequestFilePicker: () => void;
    };
  }

  it('send posts message via vscode API', () => {
    const { initProtocol, send } = loadProtocol();
    initProtocol();
    send({ type: 'prompt', text: 'hello' });
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'prompt', text: 'hello' });
  });

  it('on registers listener and receives events', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();

    const received: unknown[] = [];
    on('message_update', (msg) => received.push(msg));

    messageHandler?.({
      data: { type: 'from-extension', message: { type: 'message_update', text: 'chunk' } },
    } as unknown as MessageEvent);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'message_update', text: 'chunk' });
  });

  it('on returns unsubscribe function', () => {
    const { initProtocol, on } = loadProtocol();
    initProtocol();

    const received: unknown[] = [];
    const unsub = on('message_update', (msg) => received.push(msg));
    unsub();

    messageHandler?.({
      data: { type: 'from-extension', message: { type: 'message_update', text: 'chunk' } },
    } as unknown as MessageEvent);

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

  it('sendRequestFilePicker sends correct message', () => {
    const { initProtocol, sendRequestFilePicker } = loadProtocol();
    initProtocol();
    sendRequestFilePicker();
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'request_file_picker' });
  });
});
