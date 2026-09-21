// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { HerdrBinding } from '../../xcsh/herdrBinding';

describe('HerdrBinding', () => {
  function context() {
    const secrets = new Map<string, string>();
    const store = jest.fn().mockImplementation((key: string, value: string) => {
      secrets.set(key, value);
      return Promise.resolve();
    });
    const deleteSecret = jest.fn().mockImplementation((key: string) => {
      secrets.delete(key);
      return Promise.resolve();
    });
    const extensionContext = {
      workspaceState: {
        get: jest.fn().mockReturnValue('window-a'),
        update: jest.fn().mockResolvedValue(undefined),
      },
      secrets: {
        get: jest.fn().mockImplementation((key: string) => Promise.resolve(secrets.get(key))),
        store,
        delete: deleteSecret,
      },
    } as unknown as vscode.ExtensionContext;
    return { extensionContext, store, deleteSecret };
  }

  it('claims over stdin and stores only the renewable lease in SecretStorage', async () => {
    const { extensionContext, store } = context();
    const pairing = JSON.stringify({
      version: 1,
      endpoint: '/tmp/herdr.sock',
      token: 'pair-secret',
    });
    const runner = jest.fn().mockResolvedValue(
      JSON.stringify({
        version: 1,
        endpoint: '/tmp/herdr.sock',
        lease: 'lease-secret',
        pane: { workspace_id: 'w1', tab_id: 'w1:t1', pane_id: 'w1:p1' },
      }),
    );
    const binding = new HerdrBinding(extensionContext, runner, () => '/usr/bin/herdr');

    await binding.pair(pairing);

    expect(runner).toHaveBeenCalledWith('/usr/bin/herdr', ['context', 'claim', '--consumer-id', 'window-a'], pairing);
    expect(JSON.stringify(runner.mock.calls[0]?.[1])).not.toContain('pair-secret');
    expect(store).toHaveBeenCalledWith(
      'xcsh.herdr.lease.window-a',
      JSON.stringify({ version: 1, endpoint: '/tmp/herdr.sock', lease: 'lease-secret' }),
    );
  });

  it('resolves over stdin and rejects non-allowlisted context', async () => {
    const { extensionContext, deleteSecret } = context();
    await extensionContext.secrets.store(
      'xcsh.herdr.lease.window-a',
      JSON.stringify({ version: 1, endpoint: '/tmp/herdr.sock', lease: 'lease-secret' }),
    );
    const runner = jest.fn().mockResolvedValue(
      JSON.stringify({
        capabilities: { worker_context_handoff: 1 },
        pane: { workspace_id: 'w1', tab_id: 'w1:t1', pane_id: 'w1:p1' },
        environment: {
          HERDR_ENV: '1',
          HERDR_SOCKET_PATH: '/tmp/herdr.sock',
          HERDR_WORKSPACE_ID: 'w1',
          HERDR_TAB_ID: 'w1:t1',
          HERDR_PANE_ID: 'w1:p1',
          HERDR_BIN_PATH: '/usr/bin/herdr',
        },
      }),
    );
    const binding = new HerdrBinding(extensionContext, runner, () => '/usr/bin/herdr');

    await expect(binding.resolveEnvironment()).resolves.toEqual({
      HERDR_ENV: '1',
      HERDR_SOCKET_PATH: '/tmp/herdr.sock',
      HERDR_WORKSPACE_ID: 'w1',
      HERDR_TAB_ID: 'w1:t1',
      HERDR_PANE_ID: 'w1:p1',
      HERDR_BIN_PATH: '/usr/bin/herdr',
    });
    expect(runner).toHaveBeenCalledWith(
      '/usr/bin/herdr',
      ['context', 'resolve', '--endpoint', '/tmp/herdr.sock', '--consumer-id', 'window-a'],
      'lease-secret',
    );

    runner.mockResolvedValueOnce(
      JSON.stringify({
        capabilities: { worker_context_handoff: 1 },
        pane: { workspace_id: 'w1', tab_id: 'w1:t1', pane_id: 'w1:p1' },
        environment: {
          HERDR_ENV: '1',
          HERDR_SOCKET_PATH: '/tmp/herdr.sock',
          HERDR_WORKSPACE_ID: 'w1',
          HERDR_TAB_ID: 'w1:t1',
          HERDR_PANE_ID: 'w1:p1',
          HERDR_BIN_PATH: '/usr/bin/herdr',
          HERDR_CONTEXT_CAPABILITY: 'forbidden',
        },
      }),
    );
    await expect(binding.resolveEnvironment()).resolves.toEqual({});
    expect(deleteSecret).toHaveBeenCalledWith('xcsh.herdr.lease.window-a');
  });

  it('rejects malformed pairing data before invoking Herdr', async () => {
    const { extensionContext, store } = context();
    const runner = jest.fn();
    const binding = new HerdrBinding(extensionContext, runner, () => '/usr/bin/herdr');

    await expect(binding.pair('{not-json')).rejects.toThrow('not valid JSON');
    await expect(binding.pair(JSON.stringify({ version: 1, endpoint: '/tmp/herdr.sock', token: '' }))).rejects.toThrow(
      'incomplete or unsupported',
    );
    expect(runner).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('does not persist a pairing when the Herdr binary is unavailable', async () => {
    const { extensionContext, store } = context();
    const runner = jest.fn();
    const binding = new HerdrBinding(extensionContext, runner, () => null);
    const pairing = JSON.stringify({
      version: 1,
      endpoint: '/tmp/herdr.sock',
      token: 'pair-secret',
    });

    await expect(binding.pair(pairing)).rejects.toThrow('Herdr is not installed');
    expect(runner).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('clears a stale lease and bounds the pair-again warning', async () => {
    const { extensionContext, deleteSecret } = context();
    await extensionContext.secrets.store(
      'xcsh.herdr.lease.window-a',
      JSON.stringify({ version: 1, endpoint: '/tmp/herdr.sock', lease: 'lease-secret' }),
    );
    const runner = jest.fn().mockRejectedValue(new Error('server unavailable'));
    const warning = vscode.window.showWarningMessage as jest.Mock;
    warning.mockClear();
    const binding = new HerdrBinding(extensionContext, runner, () => '/usr/bin/herdr');

    await expect(binding.resolveEnvironment()).resolves.toEqual({});
    await expect(binding.resolveEnvironment()).resolves.toEqual({});

    expect(deleteSecret).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Pair this window again'));
  });

  it('requires the handoff capability and clears unsupported leases', async () => {
    const { extensionContext, deleteSecret } = context();
    await extensionContext.secrets.store(
      'xcsh.herdr.lease.window-a',
      JSON.stringify({ version: 1, endpoint: '/tmp/herdr.sock', lease: 'lease-secret' }),
    );
    const runner = jest.fn().mockResolvedValue(
      JSON.stringify({
        capabilities: {},
        pane: { workspace_id: 'w1', tab_id: 'w1:t1', pane_id: 'w1:p1' },
        environment: {
          HERDR_ENV: '1',
          HERDR_SOCKET_PATH: '/tmp/herdr.sock',
          HERDR_WORKSPACE_ID: 'w1',
          HERDR_TAB_ID: 'w1:t1',
          HERDR_PANE_ID: 'w1:p1',
          HERDR_BIN_PATH: '/usr/bin/herdr',
        },
      }),
    );
    const binding = new HerdrBinding(extensionContext, runner, () => '/usr/bin/herdr');

    await expect(binding.resolveEnvironment()).resolves.toEqual({});
    expect(deleteSecret).toHaveBeenCalledWith('xcsh.herdr.lease.window-a');
  });

  it('disconnects over stdin and removes the local binding even when revocation fails', async () => {
    const { extensionContext, deleteSecret } = context();
    await extensionContext.secrets.store(
      'xcsh.herdr.lease.window-a',
      JSON.stringify({ version: 1, endpoint: '/tmp/herdr.sock', lease: 'lease-secret' }),
    );
    const runner = jest.fn().mockRejectedValue(new Error('server unavailable'));
    const binding = new HerdrBinding(extensionContext, runner, () => '/usr/bin/herdr');

    await expect(binding.disconnect()).resolves.toBeUndefined();

    expect(runner).toHaveBeenCalledWith(
      '/usr/bin/herdr',
      ['context', 'revoke', '--endpoint', '/tmp/herdr.sock', '--consumer-id', 'window-a'],
      'lease-secret',
    );
    expect(JSON.stringify(runner.mock.calls[0]?.[1])).not.toContain('lease-secret');
    expect(deleteSecret).toHaveBeenCalledWith('xcsh.herdr.lease.window-a');
  });
});
