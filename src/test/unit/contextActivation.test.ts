// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { ContextActivationController } from '../../commands/contextActivation';
import type { ContextManager } from '../../config/contextManager';

const CONTEXT = {
  name: 'candidate',
  apiUrl: 'https://tenant.example.test',
  apiToken: 'token',
  defaultNamespace: 'default',
};

function manager(): ContextManager {
  return {
    getContext: jest.fn().mockResolvedValue(CONTEXT),
    setActiveContext: jest.fn().mockResolvedValue(undefined),
  } as unknown as ContextManager;
}

describe('ContextActivationController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('commits the active pointer only after namespace discovery succeeds', async () => {
    const mgr = manager();
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ name: 'default' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;

    await expect(new ContextActivationController(mgr, fetchImpl).run('candidate')).resolves.toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const setActiveContextMock = jest.mocked(mgr.setActiveContext);
    expect(fetchImpl).toHaveBeenCalled();
    expect(setActiveContextMock).toHaveBeenCalledWith('candidate');
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      setActiveContextMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('preserves the active pointer when validation is rejected', async () => {
    const mgr = manager();
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
      ) as unknown as typeof fetch;
    jest.mocked(vscode.window.showErrorMessage).mockResolvedValue(undefined);

    await expect(new ContextActivationController(mgr, fetchImpl).run('candidate')).resolves.toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.setActiveContext)).not.toHaveBeenCalled();
  });

  it('retries validation before committing when Retry is selected', async () => {
    const mgr = manager();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as unknown as typeof fetch;
    jest.mocked(vscode.window.showErrorMessage).mockResolvedValueOnce('Retry' as never);

    await expect(new ContextActivationController(mgr, fetchImpl).run('candidate')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('opens the affected context directly when Edit Context is selected', async () => {
    const mgr = manager();
    const fetchImpl = jest.fn().mockResolvedValue(new Response('{}', { status: 401 })) as unknown as typeof fetch;
    jest.mocked(vscode.window.showErrorMessage).mockResolvedValueOnce('Edit Context' as never);

    await expect(new ContextActivationController(mgr, fetchImpl).run('candidate')).resolves.toBe(false);
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('xcsh.editContext', 'candidate');
  });
});
