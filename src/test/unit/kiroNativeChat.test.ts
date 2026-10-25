// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { registerKiroChatCommands } from '../../xcsh/kiroNativeChat';

const nativeCommand = 'kiroAgent.focusChatInput';
const handlers = new Map<string, (...args: unknown[]) => unknown>();

function context(): vscode.ExtensionContext {
  return { subscriptions: [] } as unknown as vscode.ExtensionContext;
}

describe('Kiro native sidebar routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();
    jest.replaceProperty(vscode.env, 'appName', 'Kiro');
    jest.mocked(vscode.commands.getCommands).mockResolvedValue([nativeCommand]);
    jest.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
      handlers.set(command, handler);
      return new vscode.Disposable(() => {});
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens native chat without choosing a model or passing credentials', async () => {
    expect(registerKiroChatCommands(context())).toBe(true);
    await handlers.get('xcsh.xcsh.openPanel')?.();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(nativeCommand, { ensureSession: true });
  });

  it('creates a native conversation using Kiro selection', async () => {
    registerKiroChatCommands(context());
    await handlers.get('xcsh.xcsh.newSession')?.();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(nativeCommand, {
      ensureSession: true,
      newSession: true,
    });
  });

  it('drafts resource context without automatically submitting it', async () => {
    registerKiroChatCommands(context());
    await handlers.get('xcsh.attachToChat')?.({ name: 'sample', content: '{"metadata":{"name":"sample"}}' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(nativeCommand, {
      ensureSession: true,
      prompt: 'Resource: sample\n\n```json\n{"metadata":{"name":"sample"}}\n```',
      submit: false,
    });
  });

  it('reports unavailable native chat and keeps the existing model unchanged', async () => {
    jest.mocked(vscode.commands.getCommands).mockResolvedValue([]);
    registerKiroChatCommands(context());
    await handlers.get('xcsh.xcsh.openPanel')?.();
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(nativeCommand, expect.anything());
  });

  it('does not expose native errors or credentials when chat fails', async () => {
    jest
      .mocked(vscode.commands.executeCommand)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('private native failure'));
    registerKiroChatCommands(context());
    await handlers.get('xcsh.xcsh.openPanel')?.();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Kiro chat is unavailable. Try reopening the Kiro window.',
    );
  });

  it('does not register native routing in VS Code', () => {
    jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
    expect(registerKiroChatCommands(context())).toBe(false);
    expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
  });
});
