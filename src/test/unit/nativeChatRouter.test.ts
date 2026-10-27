// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { NativeChatRouter, registerNativeChatCommands } from '../../xcsh/nativeChatRouter';

let storage: string;
let available: boolean;
let workspace: string;
let router: NativeChatRouter;
const agent = vscode.Uri.file('/extension/agents/xcsh.agent.md');

beforeEach(async () => {
  jest.clearAllMocks();
  storage = await mkdtemp(join(tmpdir(), 'xcsh-native-chat-'));
  available = true;
  workspace = 'workspace-a';
  router = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => available,
    workspace: () => workspace,
  });
  jest.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  jest
    .mocked(vscode.commands.getCommands)
    .mockResolvedValue(['workbench.action.chat.openxcsh', 'workbench.action.chat.openNewChatSessionInPlace.local']);
});
afterEach(async () => {
  router.dispose();
  await rm(storage, { recursive: true, force: true });
  jest.restoreAllMocks();
});

it('opens the extension-owned agent without supplying a model or replacing a draft', async () => {
  await router.open();
  expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.openxcsh', {
    mode: agent.toString(),
  });
  expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
});

it('rejects an edited or removed managed agent before touching native chat', async () => {
  const guarded = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
    verifyAgent: () => Promise.reject(new Error('NATIVE_AGENT_CONFLICT')),
  });
  await expect(guarded.open()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  guarded.dispose();
});

it('revalidates the owned agent after native discovery before selecting it', async () => {
  let intact = true;
  const guarded = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
    verifyAgent: () => {
      return intact ? Promise.resolve() : Promise.reject(new Error('NATIVE_AGENT_CONFLICT'));
    },
  });
  jest.mocked(vscode.commands.getCommands).mockImplementationOnce(() => {
    intact = false;
    return Promise.resolve(['workbench.action.chat.openxcsh']);
  });
  await expect(guarded.open()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
  guarded.dispose();
});

it('creates a Local session before selecting the exact agent, without submitting input', async () => {
  await router.newSession();
  expect(jest.mocked(vscode.commands.executeCommand).mock.calls).toEqual([
    ['workbench.action.chat.open'],
    ['workbench.action.chat.openxcsh', { mode: agent.toString() }],
    ['workbench.action.chat.openNewChatSessionInPlace.local', 'sidebar'],
    ['workbench.action.chat.openxcsh', { mode: agent.toString(), query: ' ', isPartialQuery: true }],
  ]);
});

it('creates Local first when the current harness does not expose custom agents', async () => {
  jest
    .mocked(vscode.commands.getCommands)
    .mockResolvedValueOnce(['workbench.action.chat.openNewChatSessionInPlace.local'])
    .mockResolvedValue(['workbench.action.chat.openxcsh']);
  await router.newSession();
  expect(jest.mocked(vscode.commands.executeCommand).mock.calls).toEqual([
    ['workbench.action.chat.open'],
    ['workbench.action.chat.openNewChatSessionInPlace.local', 'sidebar'],
    ['workbench.action.chat.openxcsh', { mode: agent.toString(), query: ' ', isPartialQuery: true }],
  ]);
});

it('attaches a private immutable resource file without sending or replacing draft text', async () => {
  await router.attach({ name: '../../load-balancer', content: '{"metadata":{"name":"sample"}}' });
  const calls = jest.mocked(vscode.commands.executeCommand).mock.calls;
  expect(calls).toHaveLength(3);
  const options = calls[2]?.[1] as { mode: string; attachFiles: vscode.Uri[] };
  expect(options.mode).toBe(agent.toString());
  expect(options.attachFiles).toHaveLength(1);
  expect(options.attachFiles[0]?.fsPath.startsWith(storage)).toBe(true);
  expect(await readFile(options.attachFiles[0]!.fsPath, 'utf8')).toBe('{"metadata":{"name":"sample"}}');
  expect(options).not.toHaveProperty('isPartialQuery');
  expect(options).not.toHaveProperty('query');
  router.dispose();
  expect(await readFile(options.attachFiles[0]!.fsPath, 'utf8')).toContain('sample');
});

it('rejects malformed or oversized attachments before opening native chat or writing a file', async () => {
  await expect(router.attach({ name: 'sample', content: '{' })).rejects.toThrow('ATTACHMENT_INVALID');
  await expect(router.attach({ name: 'sample', content: 'x'.repeat(1024 * 1024 + 1) })).rejects.toThrow(
    'ATTACHMENT_TOO_LARGE',
  );
  expect(await readdir(storage)).toEqual([]);
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
});

it('serializes entrypoints so a new session cannot interleave with an attachment', async () => {
  let release!: () => void;
  jest.mocked(vscode.commands.executeCommand).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const first = router.newSession();
  await Promise.resolve();
  const second = router.open();
  await Promise.resolve();
  expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, second]);
  expect(jest.mocked(vscode.commands.executeCommand).mock.calls.map((call) => call[0])).toEqual([
    'workbench.action.chat.open',
    'workbench.action.chat.openxcsh',
    'workbench.action.chat.openNewChatSessionInPlace.local',
    'workbench.action.chat.openxcsh',
    'workbench.action.chat.open',
    'workbench.action.chat.openxcsh',
  ]);
});

it('rechecks readiness and workspace after awaits before creating or attaching data', async () => {
  jest.mocked(vscode.commands.executeCommand).mockImplementationOnce(() => {
    workspace = 'workspace-b';
    return Promise.resolve();
  });
  await expect(router.newSession()).rejects.toThrow('STALE_WORKSPACE');
  expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
  available = false;
  await expect(router.open()).rejects.toThrow('NATIVE_CHAT_UNAVAILABLE');
});

it('fails closed while the extension-owned native agent command is unavailable', async () => {
  const notReady = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
    agentRegistrationTimeoutMs: 0,
  });
  jest.mocked(vscode.commands.getCommands).mockResolvedValue([]);
  await expect(notReady.open()).rejects.toThrow('NATIVE_AGENT_NOT_READY');
  expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open');
  notReady.dispose();
});

it('rejects background routing before touching native chat, preserving the selected model and draft', async () => {
  jest.replaceProperty(vscode.window, 'state', { focused: false, active: true });
  await expect(router.open()).rejects.toThrow('NATIVE_CHAT_WINDOW_NOT_FOCUSED');
  await expect(router.newSession()).rejects.toThrow('NATIVE_CHAT_WINDOW_NOT_FOCUSED');
  await expect(router.attach({ name: 'sample', content: '{}' })).rejects.toThrow('NATIVE_CHAT_WINDOW_NOT_FOCUSED');
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  expect(await readdir(storage)).toEqual([]);
});

it('stops a queued native transition when its workspace window loses focus', async () => {
  jest.mocked(vscode.commands.executeCommand).mockImplementationOnce(() => {
    jest.replaceProperty(vscode.window, 'state', { focused: false, active: true });
    return Promise.resolve();
  });
  await expect(router.newSession()).rejects.toThrow('NATIVE_CHAT_WINDOW_NOT_FOCUSED');
  expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
});

it('prepares native model metadata before any chat command without selecting a model', async () => {
  let release!: () => void;
  const preparing = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
    prepareModels: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  });
  const opened = preparing.open();
  await Promise.resolve();
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  release();
  await opened;
  expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.openxcsh', {
    mode: agent.toString(),
  });
  preparing.dispose();
});

it('rejects failed model preparation before altering the current session', async () => {
  const preparing = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
    prepareModels: () => Promise.reject(new Error('MODEL_CATALOG_UNAVAILABLE')),
  });
  await expect(preparing.newSession()).rejects.toThrow('MODEL_CATALOG_UNAVAILABLE');
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  preparing.dispose();
});

it('does not create a session when the agent is unavailable, preserving the existing conversation', async () => {
  const notReady = new NativeChatRouter({
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
    agentRegistrationTimeoutMs: 0,
  });
  jest.mocked(vscode.commands.getCommands).mockResolvedValue([]);
  await expect(notReady.newSession()).rejects.toThrow('NATIVE_AGENT_NOT_READY');
  expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
    'workbench.action.chat.openNewChatSessionInPlace.local',
    expect.anything(),
  );
  notReady.dispose();
});

it('rechecks cancellation during agent discovery before creating a session', async () => {
  const token = { isCancellationRequested: false } as vscode.CancellationToken;
  jest.mocked(vscode.commands.getCommands).mockImplementationOnce(() => {
    Object.assign(token, { isCancellationRequested: true });
    return Promise.resolve(['workbench.action.chat.openxcsh']);
  });
  await expect(router.newSession(token)).rejects.toThrow('CANCELED');
  expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
    'workbench.action.chat.openNewChatSessionInPlace.local',
    expect.anything(),
  );
});

it('blocks canceled and disposed requests, and lets a subsequent request recover after an error', async () => {
  const canceled = { isCancellationRequested: true } as vscode.CancellationToken;
  await expect(router.open(canceled)).rejects.toThrow('CANCELED');
  expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  await router.open();
  router.dispose();
  await expect(router.open()).rejects.toThrow('NATIVE_CHAT_UNAVAILABLE');
});

it('gates Kiro and unavailable native commands instead of registering an ordinary-chat fallback', async () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  const options = {
    agentUri: agent,
    storagePath: storage,
    isAvailable: () => true,
    workspace: () => workspace,
  };
  jest.replaceProperty(vscode.env, 'appName', 'Kiro');
  expect(await registerNativeChatCommands(context, options)).toBe(false);
  expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
  jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
  jest.mocked(vscode.commands.getCommands).mockResolvedValue(['workbench.action.chat.open']);
  expect(await registerNativeChatCommands(context, options)).toBe(false);
  expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
});

it('registers all three native entrypoints only with supported commands and successful readiness', async () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
  jest
    .mocked(vscode.commands.getCommands)
    .mockResolvedValue(['workbench.action.chat.open', 'workbench.action.chat.openNewChatSessionInPlace.local']);
  expect(
    await registerNativeChatCommands(context, {
      agentUri: agent,
      storagePath: storage,
      isAvailable: () => true,
      workspace: () => workspace,
    }),
  ).toBe(true);
  expect(jest.mocked(vscode.commands.registerCommand).mock.calls.map((call) => call[0])).toEqual([
    'xcsh.xcsh.openPanel',
    'xcsh.xcsh.newSession',
    'xcsh.attachToChat',
  ]);
});

it('preserves existing command registrations on conflicts', async () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
  jest
    .mocked(vscode.commands.getCommands)
    .mockResolvedValue([
      'workbench.action.chat.open',
      'workbench.action.chat.openNewChatSessionInPlace.local',
      'xcsh.xcsh.openPanel',
    ]);
  expect(
    await registerNativeChatCommands(context, {
      agentUri: agent,
      storagePath: storage,
      isAvailable: () => true,
      workspace: () => workspace,
    }),
  ).toBe(false);
  expect(vscode.commands.registerCommand).not.toHaveBeenCalled();
});

it('returns an explicit routing result so command clients cannot mistake a warning for success', async () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
  jest
    .mocked(vscode.commands.getCommands)
    .mockResolvedValue([
      'workbench.action.chat.open',
      'workbench.action.chat.openNewChatSessionInPlace.local',
      'workbench.action.chat.openxcsh',
    ]);
  expect(
    await registerNativeChatCommands(context, {
      agentUri: agent,
      storagePath: storage,
      isAvailable: () => available,
      workspace: () => workspace,
    }),
  ).toBe(true);
  const openPanel = jest.mocked(vscode.commands.registerCommand).mock.calls[0]?.[1];
  if (!openPanel) {
    throw new Error('Missing test command');
  }
  expect(await openPanel()).toBe(true);
  available = false;
  expect(await openPanel()).toBe(false);
});

it('rolls back partial registration if another contributor claims a command during activation', async () => {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  const dispose = jest.fn();
  jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
  jest
    .mocked(vscode.commands.getCommands)
    .mockResolvedValue(['workbench.action.chat.open', 'workbench.action.chat.openNewChatSessionInPlace.local']);
  jest
    .mocked(vscode.commands.registerCommand)
    .mockReturnValueOnce({ dispose })
    .mockImplementationOnce(() => {
      throw new Error('Command conflict');
    });
  expect(
    await registerNativeChatCommands(context, {
      agentUri: agent,
      storagePath: storage,
      isAvailable: () => true,
      workspace: () => workspace,
    }),
  ).toBe(false);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(context.subscriptions).toHaveLength(0);
});
