// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as vscode from 'vscode';
import { MAX_ATTACHMENT_BYTES } from '../../xcsh/attachment';
import { resolveAttachments } from '../../xcsh/attachmentResolvers';
import type { Attachment } from '../../xcsh/attachmentTypes';
import { XcshPanelProvider } from '../../xcsh/panelProvider';
import type { XcshRpcBridge } from '../../xcsh/rpcBridge';

jest.mock('../../xcsh/attachmentResolvers', () => ({ resolveAttachments: jest.fn().mockResolvedValue([]) }));
const resolveAttachmentsMock = resolveAttachments as jest.MockedFunction<typeof resolveAttachments>;

function createMockBridge() {
  return {
    onEvent: jest.fn(() => ({ dispose: jest.fn() })),
    onMessageStream: jest.fn(() => ({ dispose: jest.fn() })),
    prompt: jest.fn(),
    abort: jest.fn(),
    getState: jest.fn().mockResolvedValue({ model: { name: 'test' } }),
    getIntegrations: jest.fn().mockRejectedValue(new Error('not supported')),
    sendCommand: jest.fn().mockResolvedValue({ type: 'response', success: true }),
    setLocale: jest.fn().mockResolvedValue(undefined),
  } as unknown as XcshRpcBridge;
}

function createMockWebviewView() {
  const messageHandlers: Array<(msg: { type: string; [key: string]: unknown }) => void> = [];
  const mockWebview = {
    options: {},
    html: '',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn((handler) => {
      messageHandlers.push(handler);
      return { dispose: jest.fn() };
    }),
    asWebviewUri: jest.fn((uri) => uri),
    cspSource: 'vscode-webview:',
  };
  const mockWebviewView = {
    webview: mockWebview,
    onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeVisibility: jest.fn(() => ({ dispose: jest.fn() })),
    visible: true,
    show: jest.fn(),
  } as unknown as vscode.WebviewView;
  return { mockWebviewView, messageHandlers };
}

describe('XcshPanelProvider', () => {
  it('has correct view type', () => {
    expect(XcshPanelProvider.viewType).toBe('xcsh.xcshPanel');
  });

  it('has correct secondary view type', () => {
    expect(XcshPanelProvider.viewTypeSecondary).toBe('xcsh.xcshPanelSecondary');
  });

  it('constructs without error', () => {
    const mockUri = { fsPath: '/test', scheme: 'file' } as unknown as vscode.Uri;
    const mockBridge = createMockBridge();
    const provider = new XcshPanelProvider(mockUri, mockBridge);
    expect(provider).toBeDefined();
  });

  describe('handleWebviewMessage via resolveWebviewView', () => {
    let sendCommandMock: jest.Mock;
    let messageHandlers: Array<(msg: { type: string; [key: string]: unknown }) => void>;

    beforeEach(() => {
      const mockUri = { fsPath: '/test', scheme: 'file' } as unknown as vscode.Uri;
      sendCommandMock = jest.fn().mockResolvedValue({ type: 'response', success: true });
      const bridge = {
        onEvent: jest.fn(() => ({ dispose: jest.fn() })),
        onMessageStream: jest.fn(() => ({ dispose: jest.fn() })),
        prompt: jest.fn(),
        abort: jest.fn(),
        getState: jest.fn().mockResolvedValue({ model: { name: 'test' } }),
        getIntegrations: jest.fn().mockRejectedValue(new Error('not supported')),
        sendCommand: sendCommandMock,
        setLocale: jest.fn().mockResolvedValue(undefined),
      } as unknown as XcshRpcBridge;
      const provider = new XcshPanelProvider(mockUri, bridge);
      const { mockWebviewView, messageHandlers: handlers } = createMockWebviewView();
      messageHandlers = handlers;
      provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );
    });

    function dispatch(msg: { type: string; [key: string]: unknown }): void {
      const fn = messageHandlers[0];
      if (fn) {
        fn(msg);
      }
    }

    it('routes set_mode message to rpcBridge.sendCommand with set_permission_mode', () => {
      expect(messageHandlers.length).toBeGreaterThan(0);
      dispatch({ type: 'set_mode', mode: 'confirm' });
      expect(sendCommandMock).toHaveBeenCalledWith({
        type: 'set_permission_mode',
        mode: 'confirm',
      });
    });

    it('does not call sendCommand for set_mode when mode is missing', () => {
      dispatch({ type: 'set_mode' });
      expect(sendCommandMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_permission_mode' }));
    });

    it('routes set_thinking message to rpcBridge.sendCommand with set_thinking_level', () => {
      expect(messageHandlers.length).toBeGreaterThan(0);
      dispatch({ type: 'set_thinking', level: 'high' });
      expect(sendCommandMock).toHaveBeenCalledWith({
        type: 'set_thinking_level',
        level: 'high',
      });
    });

    it('does not call sendCommand for set_thinking when level is missing', () => {
      dispatch({ type: 'set_thinking' });
      expect(sendCommandMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_thinking_level' }));
    });

    it('handles request_attachment message without throwing', () => {
      resolveAttachmentsMock.mockResolvedValue([]);
      expect(() => dispatch({ type: 'request_attachment', category: 'problems' })).not.toThrow();
    });

    it('ignores request_attachment with no category', () => {
      resolveAttachmentsMock.mockClear();
      dispatch({ type: 'request_attachment' });
      expect(resolveAttachmentsMock).not.toHaveBeenCalled();
    });

    it('routes prompt with locale option from vscode.env.language', async () => {
      const vscode = await import('vscode');
      const originalLang = vscode.env.language;
      (vscode.env as { language: string }).language = 'ko';

      const bridge = jest.requireMock('../../xcsh/rpcBridge')._lastBridge ?? { prompt: jest.fn() };
      // Use the real bridge from the provider
      const promptMock = jest.fn();
      const testBridge = {
        onEvent: jest.fn(() => ({ dispose: jest.fn() })),
        onMessageStream: jest.fn(() => ({ dispose: jest.fn() })),
        prompt: promptMock,
        abort: jest.fn(),
        getState: jest.fn().mockResolvedValue({ model: { name: 'test' } }),
        getIntegrations: jest.fn().mockRejectedValue(new Error('not supported')),
        sendCommand: jest.fn().mockResolvedValue({ type: 'response', success: true }),
        setLocale: jest.fn().mockResolvedValue(undefined),
      } as unknown as XcshRpcBridge;
      const mockUri = { fsPath: '/test', scheme: 'file' } as unknown as vscode.Uri;
      const provider = new XcshPanelProvider(mockUri, testBridge);
      const { mockWebviewView, messageHandlers: handlers } = createMockWebviewView();
      provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      const fn = handlers[0];
      if (fn) {
        fn({ type: 'prompt', text: '안녕하세요' });
      }
      expect(promptMock).toHaveBeenCalledWith('안녕하세요', { locale: 'ko' });

      (vscode.env as { language: string }).language = originalLang;
      void bridge;
    });

    it('calls setLocale on resolveWebviewView', async () => {
      const vscode = await import('vscode');
      const setLocaleMock = jest.fn().mockResolvedValue(undefined);
      const testBridge = {
        onEvent: jest.fn(() => ({ dispose: jest.fn() })),
        onMessageStream: jest.fn(() => ({ dispose: jest.fn() })),
        prompt: jest.fn(),
        abort: jest.fn(),
        getState: jest.fn().mockResolvedValue({ model: { name: 'test' } }),
        getIntegrations: jest.fn().mockRejectedValue(new Error('not supported')),
        sendCommand: jest.fn().mockResolvedValue({ type: 'response', success: true }),
        setLocale: setLocaleMock,
      } as unknown as XcshRpcBridge;
      const mockUri = { fsPath: '/test', scheme: 'file' } as unknown as vscode.Uri;
      const provider = new XcshPanelProvider(mockUri, testBridge);
      const { mockWebviewView } = createMockWebviewView();
      provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );

      expect(setLocaleMock).toHaveBeenCalledWith(vscode.env.language);
    });

    it('request_attachment posts attachment_added for each resolved attachment', async () => {
      const attachment: Attachment = {
        id: 'p1',
        kind: 'problems',
        label: 'workspace',
        dedupKey: 'problems:workspace',
        content: '2 errors',
        scope: 'workspace',
      };
      resolveAttachmentsMock.mockResolvedValue([attachment]);
      dispatch({ type: 'webview_ready' });
      dispatch({ type: 'request_attachment', category: 'problems' });

      // Allow the async resolver + post to complete.
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(resolveAttachmentsMock).toHaveBeenCalledWith('problems');
    });
  });

  describe('attachContext', () => {
    const mockUri = { fsPath: '/test', scheme: 'file' } as unknown as vscode.Uri;

    function setup() {
      const provider = new XcshPanelProvider(mockUri, createMockBridge());
      const { mockWebviewView, messageHandlers } = createMockWebviewView();
      provider.resolveWebviewView(
        mockWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      );
      const postMessage = (mockWebviewView.webview as unknown as { postMessage: jest.Mock }).postMessage;
      const dispatch = (msg: { type: string; [key: string]: unknown }) => messageHandlers[0]?.(msg);
      return { provider, postMessage, dispatch };
    }

    function lastAttachmentAdded(postMessage: jest.Mock): Attachment | undefined {
      const call = [...postMessage.mock.calls]
        .reverse()
        .find((c) => (c[0] as { message?: { type?: string } })?.message?.type === 'attachment_added');
      return (call?.[0]?.message as { attachment?: Attachment } | undefined)?.attachment;
    }

    it('posts attachment_added immediately when the webview is ready', () => {
      const { provider, postMessage, dispatch } = setup();
      dispatch({ type: 'webview_ready' });
      postMessage.mockClear();

      provider.attachContext('lb.http_loadbalancers.json', '{"a":1}');

      const attachment = lastAttachmentAdded(postMessage);
      expect(attachment).toMatchObject({
        kind: 'file',
        label: 'lb.http_loadbalancers.json',
        dedupKey: 'file:lb.http_loadbalancers.json',
        content: '{"a":1}',
      });
    });

    it('buffers the attachment until the webview signals readiness, then flushes once', () => {
      const { provider, postMessage, dispatch } = setup();
      // Not ready yet — nothing should be delivered.
      provider.attachContext('lb.http_loadbalancers.json', '{"a":1}');
      expect(lastAttachmentAdded(postMessage)).toBeUndefined();

      // Readiness flushes the buffered attachment.
      dispatch({ type: 'webview_ready' });
      expect(lastAttachmentAdded(postMessage)).toMatchObject({
        kind: 'file',
        label: 'lb.http_loadbalancers.json',
        content: '{"a":1}',
      });

      // A second readiness signal must not re-deliver a consumed attachment.
      postMessage.mockClear();
      dispatch({ type: 'webview_ready' });
      expect(lastAttachmentAdded(postMessage)).toBeUndefined();
    });

    it('rejects an over-size payload with a warning and no post', async () => {
      const vscode = await import('vscode');
      (vscode.window.showWarningMessage as jest.Mock).mockClear();
      const { provider, postMessage, dispatch } = setup();
      dispatch({ type: 'webview_ready' });
      postMessage.mockClear();

      provider.attachContext('huge.json', 'x'.repeat(MAX_ATTACHMENT_BYTES + 1));

      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      expect(lastAttachmentAdded(postMessage)).toBeUndefined();
    });
  });
});
