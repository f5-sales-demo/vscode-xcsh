// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ContextAddController } from '../../commands/contextAddWizard';
import type { ContextManager } from '../../config/contextManager';

function manager(overrides: Partial<ContextManager> = {}): ContextManager {
  return {
    contextExists: jest.fn().mockReturnValue(false),
    getContext: jest.fn().mockResolvedValue(null),
    addContext: jest.fn().mockResolvedValue(undefined),
    addGlobalContextAndLink: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ContextManager;
}

describe('ContextAddController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('detects an existing CLI context at the name step before collecting credentials', async () => {
    const mgr = manager({ contextExists: jest.fn().mockReturnValue(true) as ContextManager['contextExists'] });
    jest.mocked(vscode.window.showInputBox).mockResolvedValueOnce('cli-context');

    await expect(new ContextAddController(mgr, undefined).run()).resolves.toBeUndefined();
    expect(vscode.window.showInputBox).toHaveBeenCalledTimes(1);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.addContext)).not.toHaveBeenCalled();
  });

  it('normalizes assignments and preserves a trailing equals token in canonical global creation', async () => {
    const mgr = manager();
    jest
      .mocked(vscode.window.showInputBox)
      .mockResolvedValueOnce('production')
      .mockResolvedValueOnce('XCSH_API_URL=https://tenant.example.test/web/home')
      .mockResolvedValueOnce('XCSH_API_TOKEN=opaque=')
      .mockResolvedValueOnce('XCSH_USERNAME=user@example.test')
      .mockResolvedValueOnce("XCSH_CONSOLE_PASSWORD='password='");
    jest.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: 'default',
      isCustom: false,
    } as vscode.QuickPickItem);
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ name: 'default' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    await expect(new ContextAddController(mgr, undefined, fetchImpl).run()).resolves.toBe('production');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.addContext)).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: 'https://tenant.example.test',
        apiToken: 'opaque=',
        env: { XCSH_USERNAME: 'user@example.test', XCSH_CONSOLE_PASSWORD: 'password=' },
        sensitiveKeys: ['XCSH_CONSOLE_PASSWORD'],
      }),
    );
  });

  it.each([0, 1, 2, 3, 4])('cancellation at input step %d performs no writes', async (cancelAt) => {
    const mgr = manager();
    const values: Array<string | undefined> = ['new-context', 'https://tenant.example.test', 'token', '', ''];
    values[cancelAt] = undefined;
    for (const value of values) {
      jest.mocked(vscode.window.showInputBox).mockResolvedValueOnce(value);
    }
    jest.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: 'default',
      isCustom: false,
    } as vscode.QuickPickItem);
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ) as unknown as typeof fetch;

    await new ContextAddController(mgr, undefined, fetchImpl).run();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.addContext)).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.addGlobalContextAndLink)).not.toHaveBeenCalled();
  });

  it('cancellation at namespace selection performs no writes', async () => {
    const mgr = manager();
    jest
      .mocked(vscode.window.showInputBox)
      .mockResolvedValueOnce('new-context')
      .mockResolvedValueOnce('https://tenant.example.test')
      .mockResolvedValueOnce('token');
    jest.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ) as unknown as typeof fetch;

    await new ContextAddController(mgr, undefined, fetchImpl).run();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.addContext)).not.toHaveBeenCalled();
  });

  it('cancellation at custom namespace entry performs no writes', async () => {
    const mgr = manager();
    jest
      .mocked(vscode.window.showInputBox)
      .mockResolvedValueOnce('new-context')
      .mockResolvedValueOnce('https://tenant.example.test')
      .mockResolvedValueOnce('token')
      .mockResolvedValueOnce(undefined);
    jest
      .mocked(vscode.window.showQuickPick)
      .mockResolvedValueOnce({ label: 'custom', isCustom: true } as vscode.QuickPickItem);
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ) as unknown as typeof fetch;

    await new ContextAddController(mgr, undefined, fetchImpl).run();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.addContext)).not.toHaveBeenCalled();
  });

  it('cancellation at project scope selection performs no writes', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-wizard-test-'));
    fs.mkdirSync(path.join(workspace, '.xcsh'));
    try {
      const mgr = manager();
      jest
        .mocked(vscode.window.showInputBox)
        .mockResolvedValueOnce('new-context')
        .mockResolvedValueOnce('https://tenant.example.test')
        .mockResolvedValueOnce('token')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('');
      jest
        .mocked(vscode.window.showQuickPick)
        .mockResolvedValueOnce({ label: 'default', isCustom: false } as vscode.QuickPickItem)
        .mockResolvedValueOnce(undefined);
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(
          new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
        ) as unknown as typeof fetch;

      await new ContextAddController(mgr, workspace, fetchImpl).run();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jest.mocked(mgr.addContext)).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jest.mocked(mgr.addGlobalContextAndLink)).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
