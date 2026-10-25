// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ResolvedContext } from '../../config/contextResolver';
import type { ContextManagerInterface } from '../../config/contextTypes';
import { NativeContextHost } from '../../xcsh/nativeContextHost';

describe('native F5 context host', () => {
  let root: string;
  let workspace: string;
  let resolved: ResolvedContext;
  let activated: boolean;
  let changed: () => void;
  let host: NativeContextHost;
  let manager: ContextManagerInterface;
  let resolveMock: jest.MockedFunction<ContextManagerInterface['resolveContext']>;
  let priorConfig: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    priorConfig = process.env.XDG_CONFIG_HOME;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-native-host-'));
    process.env.XDG_CONFIG_HOME = path.join(root, 'config');
    workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace);
    activated = true;
    resolved = {
      source: 'global',
      sourcePath: path.join(root, 'config/xcsh/contexts/sample.json'),
      context: {
        name: 'sample',
        apiUrl: 'https://sample.example.com',
        apiToken: 'synthetic-credential',
        defaultNamespace: 'default',
      },
    };
    resolveMock = jest.fn<Promise<ResolvedContext | null>, [string | undefined]>(() =>
      Promise.resolve(structuredClone(resolved)),
    );
    manager = {
      isSessionActivated: () => activated,
      resolveContext: resolveMock,
      onDidChangeContext: (listener: () => void) => {
        changed = listener;
        return new vscode.Disposable(() => {});
      },
    } as unknown as ContextManagerInterface;
    host = new NativeContextHost(manager, () => workspace, path.join(root, 'storage'));
  });

  afterEach(() => {
    host.dispose();
    fs.rmSync(root, { recursive: true, force: true });
    if (priorConfig === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = priorConfig;
    }
  });

  it('keeps persisted contexts inactive until explicit activation, honoring the env tier', async () => {
    activated = false;
    await expect(host.prepareContext()).rejects.toThrow('NO_ACTIVE_CONTEXT');
    resolved.source = 'env';
    const snapshot = await host.prepareContext();
    expect(snapshot.active).toBe(true);
    expect(snapshot).not.toHaveProperty('apiToken');
    expect(snapshot.workspaceId).not.toContain('sample');
    expect(snapshot.contextId).not.toContain('sample');
    expect(snapshot.revision).not.toContain('sample');
  });

  it('preserves unchanged bindings and invalidates them after failed preparation', async () => {
    const first = await host.prepareContext();
    const second = await host.prepareContext();
    expect(second).toEqual(first);
    activated = false;
    await expect(host.prepareContext()).rejects.toThrow('NO_ACTIVE_CONTEXT');
    expect(() => host.getContext()).toThrow('NO_ACTIVE_CONTEXT');
  });

  it('rechecks context files synchronously before the watcher has fired', async () => {
    await host.prepareContext();
    fs.mkdirSync(path.dirname(resolved.sourcePath), { recursive: true });
    fs.writeFileSync(resolved.sourcePath, '{}');
    expect(() => host.getContext()).toThrow('STALE_BINDING');
  });

  it('invalidates on context events, environment changes, and workspace switches', async () => {
    await host.prepareContext();
    changed();
    expect(() => host.getContext()).toThrow('STALE_BINDING');
    await host.prepareContext();
    const prior = process.env.XCSH_NAMESPACE;
    process.env.XCSH_NAMESPACE = 'synthetic-next';
    try {
      expect(() => host.getContext()).toThrow('STALE_BINDING');
    } finally {
      if (prior === undefined) {
        delete process.env.XCSH_NAMESPACE;
      } else {
        process.env.XCSH_NAMESPACE = prior;
      }
    }
    await host.prepareContext();
    workspace = root;
    expect(() => host.getContext()).toThrow('STALE_BINDING');
  });

  it('rejects credential rotation without refreshing an existing binding', async () => {
    const original = await host.prepareContext();
    resolved.context.apiToken = 'synthetic-rotation';
    await expect(host.getCredentials(original)).rejects.toThrow('STALE_BINDING');
    const next = await host.prepareContext();
    expect(next.revision).not.toBe(original.revision);
    await expect(host.getCredentials(original)).rejects.toThrow('STALE_BINDING');
    await expect(host.getCredentials(next)).resolves.toEqual({ apiToken: 'synthetic-rotation' });
  });

  it('rejects resolution races, unsupported versions, and expired credentials', async () => {
    resolveMock.mockImplementationOnce(() => {
      changed();
      return Promise.resolve(resolved);
    });
    await expect(host.prepareContext()).rejects.toThrow('STALE_BINDING');
    resolved.context.version = 999;
    await expect(host.prepareContext()).rejects.toThrow('CONTEXT_VERSION_UNSUPPORTED');
    resolved.context.version = 1;
    resolved.context.metadata = { expiresAt: '2000-01-01T00:00:00Z' };
    await expect(host.prepareContext()).rejects.toThrow('CREDENTIALS_EXPIRED');
  });

  it('isolates identities across editor windows', async () => {
    const other = new NativeContextHost(manager, () => workspace, path.join(root, 'storage'));
    try {
      const first = await host.prepareContext();
      const second = await other.prepareContext();
      expect(second.workspaceId).not.toBe(first.workspaceId);
      await expect(other.getCredentials(first)).rejects.toThrow('STALE_BINDING');
    } finally {
      other.dispose();
    }
  });

  it('approves only the exact displayed plan and rejects cancellation and dismissal', async () => {
    await host.prepareContext();
    const plan = {
      id: randomUUID(),
      hash: 'synthetic-plan-hash',
      entries: [{ kind: 'namespace', action: 'create' }],
    };
    jest.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce('Apply plan' as never);
    await expect(host.approve(plan)).resolves.toEqual({ approved: true, planHash: plan.hash });
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Apply this xcsh plan?',
      {
        modal: true,
        detail: JSON.stringify({ planHash: plan.hash, entries: plan.entries }, null, 2),
      },
      'Apply plan',
    );
    jest.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce(undefined);
    await expect(host.approve(plan)).resolves.toEqual({ approved: false, planHash: plan.hash });
    const controller = new AbortController();
    jest.mocked(vscode.window.showWarningMessage).mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve('Apply plan' as never);
    });
    await expect(host.approve(plan, controller.signal)).rejects.toThrow('CANCELED');
  });

  it('writes private atomic receipts and rejects unsafe identifiers and symlink storage', async () => {
    const receipt = {
      schemaVersion: 1 as const,
      planId: randomUUID(),
      planHash: 'synthetic-hash',
      binding: randomUUID(),
      stage: 'prepared',
      completed: 0,
    };
    await host.persist(receipt);
    const directory = path.join(root, 'storage/native-f5-receipts');
    const file = path.join(directory, `${receipt.planId}.json`);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(receipt);
    expect(fs.readdirSync(directory)).toEqual([`${receipt.planId}.json`]);
    if (process.platform !== 'win32') {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
    await expect(host.persist({ ...receipt, planId: '../escape' })).rejects.toThrow('INVALID_RECEIPT');
    fs.rmSync(directory, { recursive: true });
    fs.symlinkSync(workspace, directory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(host.persist(receipt)).rejects.toThrow('INVALID_RECEIPT_STORAGE');
  });
});
