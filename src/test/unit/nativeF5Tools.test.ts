// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../../config/contextTypes';
import type { NativeContextHost } from '../../xcsh/nativeContextHost';
import { type NativeF5Core, type NativeF5Input, NativeF5Tool, registerNativeF5Tool } from '../../xcsh/nativeF5Tools';

describe('native F5 operation ownership', () => {
  let root: string;
  let oldConfig: string | undefined;
  let tool: NativeF5Tool;
  let cores: jest.Mocked<NativeF5Core>[];
  let hosts: NativeContextHost[];
  let active: boolean;
  let cancellation: (() => void) | undefined;
  let canceled: boolean;
  let token: vscode.CancellationToken;

  const coreAt = (index: number): jest.Mocked<NativeF5Core> => {
    const core = cores[index];
    if (!core) {
      throw new Error('Missing core');
    }
    return core;
  };

  const invoke = (input: NativeF5Input, native = true) =>
    tool.invoke({ input, toolInvocationToken: native ? ({} as vscode.ChatParticipantToolToken) : undefined }, token);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-native-tools-'));
    oldConfig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(root, 'config');
    cores = [];
    hosts = [];
    active = true;
    canceled = false;
    cancellation = undefined;
    token = {
      get isCancellationRequested() {
        return canceled;
      },
      onCancellationRequested: (listener) => {
        cancellation = () => listener(undefined);
        return new vscode.Disposable(() => {});
      },
    };
    const manager = {
      isSessionActivated: () => active,
      onDidChangeContext: () => new vscode.Disposable(() => {}),
      resolveContext: () =>
        Promise.resolve({
          source: 'global',
          sourcePath: path.join(root, 'context.json'),
          context: {
            name: 'synthetic',
            apiUrl: 'https://example.invalid',
            apiToken: 'synthetic-credential',
            defaultNamespace: 'default',
          },
        }),
    } as unknown as ContextManagerInterface;
    tool = new NativeF5Tool(
      manager,
      () => root,
      path.join(root, 'storage'),
      (host) => {
        hosts.push(host);
        const core: jest.Mocked<NativeF5Core> = {
          bind: jest
            .fn<ReturnType<NativeF5Core['bind']>, Parameters<NativeF5Core['bind']>>()
            .mockResolvedValue({ id: 'opaque-binding' }),
          discover: jest
            .fn<ReturnType<NativeF5Core['discover']>, Parameters<NativeF5Core['discover']>>()
            .mockResolvedValue({ kinds: ['http_loadbalancer'] }),
          describe: jest
            .fn<ReturnType<NativeF5Core['describe']>, Parameters<NativeF5Core['describe']>>()
            .mockResolvedValue({}),
          validate: jest
            .fn<ReturnType<NativeF5Core['validate']>, Parameters<NativeF5Core['validate']>>()
            .mockResolvedValue([]),
          inspect: jest
            .fn<ReturnType<NativeF5Core['inspect']>, Parameters<NativeF5Core['inspect']>>()
            .mockResolvedValue({}),
          plan: jest
            .fn<ReturnType<NativeF5Core['plan']>, Parameters<NativeF5Core['plan']>>()
            .mockResolvedValue({ id: 'exact-plan' }),
          execute: jest
            .fn<ReturnType<NativeF5Core['execute']>, Parameters<NativeF5Core['execute']>>()
            .mockResolvedValue({ completed: 1 }),
          dispose: jest.fn<ReturnType<NativeF5Core['dispose']>, Parameters<NativeF5Core['dispose']>>(),
        };
        cores.push(core);
        return core;
      },
    );
  });

  afterEach(() => {
    tool.dispose();
    jest.restoreAllMocks();
    if (oldConfig === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = oldConfig;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects writes without the native request token before creating a context or core', async () => {
    await expect(invoke({ action: 'create', objects: [{}] }, false)).rejects.toThrow('NATIVE_REQUEST_REQUIRED');
    expect(cores).toHaveLength(0);
  });

  it('keeps persisted contexts inactive and never starts the optional CLI', async () => {
    active = false;
    await expect(invoke({ action: 'discover' })).rejects.toThrow('NO_ACTIVE_CONTEXT');
    expect(cores).toHaveLength(0);
  });

  it('isolates concurrent bindings and retires their hosts without exposing handles', async () => {
    const results = await Promise.all([invoke({ action: 'discover' }), invoke({ action: 'create', objects: [{}] })]);
    expect(cores).toHaveLength(2);
    expect(coreAt(0).bind.mock.calls[0]?.[0]).not.toBe(coreAt(1).bind.mock.calls[0]?.[0]);
    expect(() => hosts[0]?.getContext()).toThrow();
    expect(() => hosts[1]?.getContext()).toThrow();
    for (const core of cores) {
      expect(core.dispose.mock.calls).toHaveLength(1);
    }
    expect(JSON.stringify(results)).not.toContain('opaque-binding');
    expect(JSON.stringify(results)).not.toContain('exact-plan');
    expect(coreAt(1).execute.mock.calls[0]).toEqual([{ id: 'opaque-binding' }, 'exact-plan', expect.any(AbortSignal)]);
  });

  it('blocks execution after cancellation during planning', async () => {
    const pending = invoke({ action: 'create', objects: [{}] });
    // Allow preparation to reach the injected core before replacing its planner.
    await Promise.resolve();
    await Promise.resolve();
    const core = coreAt(0);
    core.plan.mockImplementation((_binding, _operation, _objects, signal) => {
      canceled = true;
      cancellation?.();
      if (signal?.aborted) {
        throw new Error('CANCELED');
      }
      return Promise.resolve({ id: 'unexpected' });
    });
    await expect(pending).rejects.toThrow('CANCELED');
    expect(core.execute.mock.calls).toHaveLength(0);
    expect(core.dispose.mock.calls).toHaveLength(1);
  });

  it('aborts a pending operation on disablement and prevents new operations', async () => {
    const pending = invoke({ action: 'inspect', kind: 'http_loadbalancer' });
    await Promise.resolve();
    await Promise.resolve();
    const core = coreAt(0);
    core.inspect.mockImplementation((_binding, _kind, _name, signal) => {
      tool.dispose();
      if (signal?.aborted) {
        throw new Error('CANCELED');
      }
      return Promise.resolve({});
    });
    await expect(pending).rejects.toThrow('CANCELED');
    await expect(invoke({ action: 'discover' })).rejects.toThrow('CANCELED');
  });

  it('sanitizes transport errors and never retries an uncertain mutation', async () => {
    const pending = invoke({ action: 'create', objects: [{}] });
    await Promise.resolve();
    await Promise.resolve();
    const core = coreAt(0);
    core.execute.mockRejectedValue(new Error('UNCERTAIN_MUTATION'));
    await expect(pending).rejects.toThrow('UNCERTAIN_MUTATION');
    expect(core.execute.mock.calls).toHaveLength(1);
    const next = invoke({ action: 'inspect', kind: 'http_loadbalancer' });
    await Promise.resolve();
    await Promise.resolve();
    coreAt(1).inspect.mockRejectedValue(new Error('https://private.invalid/?token=private-value'));
    await expect(next).rejects.toThrow('F5_OPERATION_FAILED');
  });

  it('preserves independently verified mutation completion after late cancellation', async () => {
    const pending = invoke({ action: 'create', objects: [{}] });
    await Promise.resolve();
    await Promise.resolve();
    coreAt(0).execute.mockImplementation(() => {
      cancellation?.();
      return Promise.resolve({ completed: 1 });
    });
    const result = await pending;
    expect(JSON.stringify(result)).toContain('completed');
    expect(coreAt(0).execute.mock.calls).toHaveLength(1);
  });

  it('disposes safely when native registration conflicts', () => {
    const registration = jest.spyOn(vscode.lm, 'registerTool').mockImplementationOnce(() => {
      throw new Error('conflict');
    });
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    expect(registerNativeF5Tool(context, tool)).toBe(false);
    expect(context.subscriptions).toHaveLength(0);
    registration.mockRestore();
  });

  it('exposes the contributed agent only after registration and clears it on removal', () => {
    jest.spyOn(vscode.lm, 'registerTool').mockReturnValue(new vscode.Disposable(() => {}));
    const command = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
    command.mockClear();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    expect(registerNativeF5Tool(context, tool)).toBe(true);
    expect(command.mock.calls).toEqual([
      ['setContext', 'xcsh.nativeF5Ready', false],
      ['setContext', 'xcsh.nativeF5Ready', true],
    ]);
    for (const disposable of context.subscriptions) {
      disposable.dispose();
    }
    expect(command.mock.calls.at(-1)).toEqual(['setContext', 'xcsh.nativeF5Ready', false]);
  });

  it('keeps the agent and native tool unavailable in Kiro', () => {
    jest.replaceProperty(vscode.env, 'appName', 'Kiro');
    const registration = jest.spyOn(vscode.lm, 'registerTool');
    registration.mockClear();
    const command = jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);
    command.mockClear();
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    expect(registerNativeF5Tool(context, tool)).toBe(false);
    expect(registration.mock.calls).toHaveLength(0);
    expect(command.mock.calls).toEqual([['setContext', 'xcsh.nativeF5Ready', false]]);
  });
});
