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

  it.each(['xcsh.xcsh.openPanel', 'xcsh.xcsh.newSession', 'xcsh.attachToChat'])(
    'gates %s without opening ordinary chat or modifying a draft',
    async (command) => {
      expect(registerKiroChatCommands(context())).toBe(true);
      expect(await handlers.get(command)?.({ name: 'sample', content: '{"metadata":{"name":"sample"}}' })).toBe(false);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'xcsh specialist chat is unavailable in this Kiro version. Contexts and resource views remain available.',
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'xcsh.usesNativeChat', true);
      expect(vscode.commands.getCommands).not.toHaveBeenCalled();
    },
  );

  it('reserves all Kiro entrypoints so the CLI chat cannot become a fallback', () => {
    const extensionContext = context();
    expect(registerKiroChatCommands(extensionContext)).toBe(true);
    expect([...handlers.keys()]).toEqual(['xcsh.xcsh.openPanel', 'xcsh.xcsh.newSession', 'xcsh.attachToChat']);
    expect(extensionContext.subscriptions).toHaveLength(3);
  });

  it('does not register native routing in VS Code', () => {
    jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
    expect(registerKiroChatCommands(context())).toBe(false);
    expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
  });
});
