// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { registerCrudCommands } from '../../commands/crud';
import type { ContextManager } from '../../config/contextManager';
import type { XCSHDescribeProvider } from '../../providers/xcshDescribeProvider';
import type { XCSHFileSystemProvider } from '../../providers/xcshFileSystemProvider';
import type { XCSHViewProvider } from '../../providers/xcshViewProvider';
import type { ResourceNode, XCSHExplorerProvider } from '../../tree/xcshExplorer';

type CommandHandler = (...args: unknown[]) => unknown;

function captureCommands(): Map<string, CommandHandler> {
  const handlers = new Map<string, CommandHandler>();
  (vscode.commands.registerCommand as jest.Mock).mockImplementation((id: string, cb: CommandHandler) => {
    handlers.set(id, cb);
    return { dispose: jest.fn() };
  });
  return handlers;
}

function makeNode(overrides: Record<string, unknown> = {}): ResourceNode {
  const data = {
    profileName: 'ctx',
    namespace: 'r-mordasiewicz',
    name: 'acme-bankexample-lb',
    resourceTypeKey: 'http_loadbalancer',
    resourceType: {
      apiPath: 'http_loadbalancers',
      apiBase: 'config',
      customGetPath: undefined,
      useListDataForDescribe: false,
    },
    ...overrides,
  };
  return { getData: () => data } as unknown as ResourceNode;
}

function registerWith(contextManager: ContextManager): Map<string, CommandHandler> {
  const handlers = captureCommands();
  const ctx = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  registerCrudCommands(
    ctx,
    {} as unknown as XCSHExplorerProvider,
    contextManager,
    {} as unknown as XCSHFileSystemProvider,
    {} as unknown as XCSHViewProvider,
    {} as unknown as XCSHDescribeProvider,
  );
  return handlers;
}

describe('xcsh.addToChat command', () => {
  beforeEach(() => {
    (vscode.commands.executeCommand as jest.Mock).mockReset();
  });

  it('fetches the resource and forwards { name, content } to xcsh.attachToChat', async () => {
    const resource = { metadata: { name: 'acme-bankexample-lb' }, spec: { domains: ['acme.bankexample.com'] } };
    const getWithOptions = jest.fn().mockResolvedValue(resource);
    const contextManager = {
      getClient: jest.fn().mockResolvedValue({ getWithOptions }),
    } as unknown as ContextManager;

    const handlers = registerWith(contextManager);
    const addToChat = handlers.get('xcsh.addToChat');
    expect(addToChat).toBeDefined();

    await addToChat?.(makeNode());

    expect(getWithOptions).toHaveBeenCalledWith('r-mordasiewicz', 'http_loadbalancers', 'acme-bankexample-lb', {
      apiBase: 'config',
      customGetPath: undefined,
    });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('xcsh.attachToChat', {
      name: 'acme-bankexample-lb.http_loadbalancers.json',
      content: JSON.stringify(resource, null, 2),
    });
  });

  it('uses cached list data (no API fetch) when the type has no GET endpoint', async () => {
    const getClient = jest.fn();
    const contextManager = { getClient } as unknown as ContextManager;
    const handlers = registerWith(contextManager);

    const cached = { metadata: { name: 'cached-thing' } };
    await handlers.get('xcsh.addToChat')?.(
      makeNode({
        name: 'cached-thing',
        resourceType: { apiPath: 'service_policys', apiBase: 'config', useListDataForDescribe: true },
        fullResourceData: cached,
      }),
    );

    expect(getClient).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('xcsh.attachToChat', {
      name: 'cached-thing.service_policys.json',
      content: JSON.stringify(cached, null, 2),
    });
  });
});
