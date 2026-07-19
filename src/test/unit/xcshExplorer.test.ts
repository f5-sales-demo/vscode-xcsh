// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { XCSHContext } from '../../config/contextTypes';
import { buildNamespacePickChoices, buildSelectableNamespaces, XCSHExplorerProvider } from '../../tree/xcshExplorer';

const NAMESPACES = ['b-x', 'a-franklin', 'default', 'system', 'shared'];

function makeProvider(defaultNamespace: string) {
  const activeContext = { name: 'ctx1', defaultNamespace } as XCSHContext;
  const contextManager = {
    getActiveContext: jest.fn().mockResolvedValue(activeContext),
  } as never;
  const client = {
    listNamespaces: jest.fn().mockResolvedValue(NAMESPACES.map((name) => ({ name, metadata: {} }))),
  };
  const clientFactory = jest.fn().mockResolvedValue(client);
  return new XCSHExplorerProvider(contextManager, clientFactory as never);
}

describe('buildSelectableNamespaces', () => {
  it('excludes system and shared, lists default first then the rest alphabetically', () => {
    expect(buildSelectableNamespaces(['b-x', 'a-franklin', 'default', 'system', 'shared'])).toEqual([
      'default',
      'a-franklin',
      'b-x',
    ]);
  });

  it('omits default when the tenant has no default namespace', () => {
    expect(buildSelectableNamespaces(['system', 'shared', 'c-ns', 'a-ns'])).toEqual(['a-ns', 'c-ns']);
  });

  it('returns an empty list when only built-in root namespaces exist', () => {
    expect(buildSelectableNamespaces(['system', 'shared'])).toEqual([]);
  });
});

describe('buildNamespacePickChoices', () => {
  it('lists default first, then custom namespaces alphabetically, with a custom-entry option last', () => {
    expect(buildNamespacePickChoices(['b-x', 'a-franklin', 'default', 'system', 'shared'])).toEqual([
      { name: 'default', isCustom: false },
      { name: 'a-franklin', isCustom: false },
      { name: 'b-x', isCustom: false },
      { name: '', isCustom: true },
    ]);
  });

  it('excludes system and shared but keeps the custom-entry option', () => {
    expect(buildNamespacePickChoices(['system', 'shared', 'c-ns', 'a-ns'])).toEqual([
      { name: 'a-ns', isCustom: false },
      { name: 'c-ns', isCustom: false },
      { name: '', isCustom: true },
    ]);
  });

  it('offers only the custom-entry option when no selectable namespaces exist', () => {
    expect(buildNamespacePickChoices(['system', 'shared'])).toEqual([{ name: '', isCustom: true }]);
    expect(buildNamespacePickChoices([])).toEqual([{ name: '', isCustom: true }]);
  });
});

describe('XCSHExplorerProvider root items', () => {
  it('renders system, shared, then the active namespace node', async () => {
    const provider = makeProvider('a-franklin');
    const roots = await provider.getChildren();
    const items = roots.map((node) => node.getTreeItem());

    expect(items.map((i) => i.label)).toEqual(['system', 'shared', 'a-franklin']);
    expect(items[0].contextValue).toBe('namespace:builtin');
    expect(items[1].contextValue).toBe('namespace:builtin');
    expect(items[2].contextValue).toBe('namespace:active');
  });

  it('falls back to the default namespace when the context has none', async () => {
    const provider = makeProvider('');
    const roots = await provider.getChildren();
    const items = roots.map((node) => node.getTreeItem());

    expect(items.map((i) => i.label)).toEqual(['system', 'shared', 'default']);
    expect(items[2].contextValue).toBe('namespace:active');
  });

  it('returns no items when there is no active context', async () => {
    const contextManager = { getActiveContext: jest.fn().mockResolvedValue(null) } as never;
    const provider = new XCSHExplorerProvider(contextManager, jest.fn() as never);
    expect(await provider.getChildren()).toEqual([]);
  });
});
