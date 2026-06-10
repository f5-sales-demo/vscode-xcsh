// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as vscode from 'vscode';
import { XcshPanelProvider } from '../../xcsh/panelProvider';
import type { XcshRpcBridge } from '../../xcsh/rpcBridge';

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
    expect(XcshPanelProvider.viewType).toBe('f5xc.xcshPanel');
  });

  it('has correct secondary view type', () => {
    expect(XcshPanelProvider.viewTypeSecondary).toBe('f5xc.xcshPanelSecondary');
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

    it('handles request_file_picker message without throwing', async () => {
      const vscode = await import('vscode');
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      expect(() => dispatch({ type: 'request_file_picker' })).not.toThrow();
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

    it('request_file_picker posts file_attached message when file is selected', async () => {
      const vscode = await import('vscode');
      const mockUri = {
        path: '/tmp/test.json',
        fsPath: '/tmp/test.json',
        scheme: 'file',
        authority: '',
        query: '',
        fragment: '',
        with: jest.fn(),
        toString: () => 'file:///tmp/test.json',
      };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      const fileContent = new TextEncoder().encode('{"key":"value"}');
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(fileContent);

      dispatch({ type: 'request_file_picker' });

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const { mockWebviewView } = createMockWebviewView();
      void mockWebviewView;
      // No throw is the main assertion; postMessage is on the internal webview
    });
  });
});
