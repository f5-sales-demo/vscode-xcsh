// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../../config/contextTypes';
import { registerNativeF5Chat } from '../../xcsh/nativeF5Activation';
import type { NativeF5CoreFactory } from '../../xcsh/nativeF5Tools';

let root: string;
let context: vscode.ExtensionContext;
let factory: jest.MockedFunction<NativeF5CoreFactory>;
let manager: ContextManagerInterface;
let resolveContext: jest.Mock;
let disposedTool: jest.Mock;
const agentDocument = "---\nname: xcsh\ntools: ['xcshF5']\n---\nUse the specification tool.\n";
const nativeCommands = [
  'workbench.action.chat.open',
  'workbench.action.chat.openNewChatSessionInPlace.local',
  'workbench.action.chat.openxcsh',
];

beforeEach(async () => {
  jest.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), 'xcsh-native-activation-'));
  context = { subscriptions: [], storageUri: vscode.Uri.file(root) } as unknown as vscode.ExtensionContext;
  factory = jest.fn();
  resolveContext = jest.fn();
  manager = {
    resolveContext,
    isSessionActivated: jest.fn(() => false),
    onDidChangeContext: () => new vscode.Disposable(() => {}),
  } as unknown as ContextManagerInterface;
  disposedTool = jest.fn();
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', [{ uri: vscode.Uri.file(root), index: 0, name: 'test' }]);
  jest.replaceProperty(vscode.workspace, 'isTrusted', true);
  jest.mocked(vscode.commands.getCommands).mockResolvedValue(nativeCommands);
  jest.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  jest.mocked(vscode.commands.registerCommand).mockImplementation(() => new vscode.Disposable(() => {}));
  jest.mocked(vscode.lm.registerTool).mockReturnValue(new vscode.Disposable(disposedTool));
  jest.spyOn(vscode.workspace, 'applyEdit').mockImplementation(async (edit) => {
    const creations = (edit as unknown as { creations: { uri: vscode.Uri; options: { contents: Uint8Array } }[] })
      .creations;
    for (const creation of creations) {
      await writeFile(creation.uri.fsPath, creation.options.contents, { flag: 'wx' });
    }
    return true;
  });
});
afterEach(async () => {
  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
  await rm(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const activate = () => registerNativeF5Chat(context, manager, { createCore: factory, agentDocument });

it('registers native chat and tools without consulting or activating contexts or requiring a CLI', async () => {
  const registration = await activate();
  expect(registration?.ready).toBe(true);
  expect(vscode.lm.registerTool).toHaveBeenCalledWith('xcsh-f5', expect.any(Object));
  expect(jest.mocked(vscode.commands.registerCommand).mock.calls.map((call) => call[0])).toEqual([
    'xcsh.xcsh.openPanel',
    'xcsh.xcsh.newSession',
    'xcsh.attachToChat',
  ]);
  expect(resolveContext).not.toHaveBeenCalled();
  expect(factory).not.toHaveBeenCalled();
  expect(await readFile(join(root, '.github', 'agents', 'xcsh.agent.md'), 'utf8')).toContain(agentDocument);
});

it('revokes native operations on disposal while preserving shared agent documents', async () => {
  const registration = await activate();
  if (!registration) {
    throw new Error('Missing test registration');
  }
  registration.dispose();
  expect(registration.ready).toBe(false);
  expect(disposedTool).toHaveBeenCalledTimes(1);
  expect(await readFile(join(root, '.github', 'agents', 'xcsh.agent.md'), 'utf8')).toContain(agentDocument);
  const tool = jest.mocked(vscode.lm.registerTool).mock.calls[0]?.[1];
  if (!tool) {
    throw new Error('Missing test tool');
  }
  await expect(
    tool.invoke({ input: { action: 'discover' }, toolInvocationToken: undefined }, {
      isCancellationRequested: false,
    } as vscode.CancellationToken),
  ).rejects.toThrow('CANCELED');
  expect(resolveContext).not.toHaveBeenCalled();
});

it('rejects workspace changes and trust loss before native routing', async () => {
  const registration = await activate();
  const openPanel = jest.mocked(vscode.commands.registerCommand).mock.calls[0]?.[1];
  if (!openPanel) {
    throw new Error('Missing test command');
  }
  jest.mocked(vscode.commands.executeCommand).mockClear();
  jest.replaceProperty(vscode.workspace, 'isTrusted', false);
  expect(registration?.ready).toBe(false);
  expect(await openPanel()).toBe(false);
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  jest.replaceProperty(vscode.workspace, 'isTrusted', true);
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', []);
  expect(registration?.ready).toBe(false);
  expect(await openPanel()).toBe(false);
});

it('preserves an existing agent and keeps entrypoints gated when registration conflicts', async () => {
  await activate();
  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
  context.subscriptions.length = 0;
  const path = join(root, '.github', 'agents', 'xcsh.agent.md');
  await writeFile(path, 'User-owned instructions');
  jest.mocked(vscode.commands.registerCommand).mockClear();
  const registration = await activate();
  expect(registration?.ready).toBe(false);
  expect(await readFile(path, 'utf8')).toBe('User-owned instructions');
  const openPanel = jest.mocked(vscode.commands.registerCommand).mock.calls[0]?.[1];
  if (!openPanel) {
    throw new Error('Missing gated command');
  }
  expect(await openPanel()).toBe(false);
});

it('stops an activation disposed while file publication is pending', async () => {
  let release!: () => void;
  jest.mocked(vscode.workspace.applyEdit).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = () => resolve(false);
      }),
  );
  const pending = activate();
  while (!release) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
  release();
  const registration = await pending;
  expect(registration?.ready).toBe(false);
  expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
  expect(disposedTool).toHaveBeenCalledTimes(1);
});

it('blocks tool access to contexts until native routing registration completes', async () => {
  let release!: () => void;
  jest.mocked(vscode.workspace.applyEdit).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = () => resolve(false);
      }),
  );
  const pending = activate();
  while (!release) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const tool = jest.mocked(vscode.lm.registerTool).mock.calls[0]?.[1];
  if (!tool) {
    throw new Error('Missing test tool');
  }
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => new vscode.Disposable(() => {}),
  } as vscode.CancellationToken;
  try {
    await expect(tool.invoke({ input: { action: 'discover' }, toolInvocationToken: undefined }, token)).rejects.toThrow(
      'CONTEXT_UNAVAILABLE',
    );
    expect(resolveContext).not.toHaveBeenCalled();
  } finally {
    release();
    await pending;
  }
});

it('does not create agents or native tools in Kiro', async () => {
  jest.replaceProperty(vscode.env, 'appName', 'Kiro');
  expect(await activate()).toBeUndefined();
  expect(vscode.lm.registerTool).not.toHaveBeenCalled();
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('gates unsupported workspaces without registering a tool or ordinary-chat fallback', async () => {
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', []);
  const registration = await activate();
  expect(registration?.ready).toBe(false);
  expect(vscode.lm.registerTool).not.toHaveBeenCalled();
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  const openPanel = jest.mocked(vscode.commands.registerCommand).mock.calls[0]?.[1];
  if (!openPanel) {
    throw new Error('Missing gated command');
  }
  expect(await openPanel()).toBe(false);
});

it('rolls back tool registration if the native command registrar fails', async () => {
  jest.mocked(vscode.commands.registerCommand).mockImplementationOnce(() => {
    throw new Error('Command conflict');
  });
  const registration = await activate();
  expect(registration?.ready).toBe(false);
  expect(disposedTool).toHaveBeenCalledTimes(1);
  expect(factory).not.toHaveBeenCalled();
});
