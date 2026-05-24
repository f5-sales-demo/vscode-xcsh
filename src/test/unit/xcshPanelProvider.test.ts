// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as vscode from 'vscode';
import { XcshPanelProvider } from '../../xcsh/panelProvider';
import type { XcshRpcBridge } from '../../xcsh/rpcBridge';

describe('XcshPanelProvider', () => {
  it('has correct view type', () => {
    expect(XcshPanelProvider.viewType).toBe('f5xc.xcshPanel');
  });

  it('has correct secondary view type', () => {
    expect(XcshPanelProvider.viewTypeSecondary).toBe('f5xc.xcshPanelSecondary');
  });

  it('constructs without error', () => {
    const mockUri = { fsPath: '/test', scheme: 'file' } as unknown as vscode.Uri;
    const mockBridge = {
      onEvent: jest.fn(() => ({ dispose: jest.fn() })),
      onMessageStream: jest.fn(() => ({ dispose: jest.fn() })),
      prompt: jest.fn(),
      abort: jest.fn(),
      getState: jest.fn(),
      sendCommand: jest.fn(),
    } as unknown as XcshRpcBridge;
    const provider = new XcshPanelProvider(mockUri, mockBridge);
    expect(provider).toBeDefined();
  });
});
