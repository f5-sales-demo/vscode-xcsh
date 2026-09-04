// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { ContextEditController } from '../../commands/contextEdit';
import type { ContextManager } from '../../config/contextManager';

const CONTEXT = {
  name: 'candidate',
  apiUrl: 'https://tenant.example.test',
  apiToken: 'old-token',
  defaultNamespace: 'default',
};

function manager(): ContextManager {
  return {
    getContexts: jest.fn().mockResolvedValue([CONTEXT]),
    getContext: jest.fn().mockResolvedValue(CONTEXT),
    updateContext: jest.fn().mockResolvedValue(undefined),
  } as unknown as ContextManager;
}

describe('ContextEditController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts a context-name argument and saves a validated API URL', async () => {
    const mgr = manager();
    jest.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'API URL' } as vscode.QuickPickItem);
    jest.mocked(vscode.window.showInputBox).mockResolvedValueOnce('https://new.example.test/web/home');
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    await new ContextEditController(mgr, fetchImpl).run('candidate');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.updateContext)).toHaveBeenCalledWith('candidate', {
      apiUrl: 'https://new.example.test',
    });
    // A string target bypasses the context chooser.
    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);
  });

  it('retains credentials when an API token edit fails validation', async () => {
    const mgr = manager();
    jest.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({ label: 'API Token' } as vscode.QuickPickItem);
    jest.mocked(vscode.window.showInputBox).mockResolvedValueOnce('bad-token');
    const fetchImpl = jest.fn().mockResolvedValue(new Response('{}', { status: 401 })) as unknown as typeof fetch;

    await new ContextEditController(mgr, fetchImpl).run('candidate');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(jest.mocked(mgr.updateContext)).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'));
  });
});
