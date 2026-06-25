// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { XCSHContext } from '../../config/contextTypes';

// Lazy imports — re-imported after jest.resetModules() so contextPaths
// picks up the XDG_CONFIG_HOME env var we set in beforeEach.
let ContextProvider: typeof import('../../tree/contextProvider').ContextProvider;
let ContextGroupItem: typeof import('../../tree/contextProvider').ContextGroupItem;
let ContextTreeItem: typeof import('../../tree/contextProvider').ContextTreeItem;
let ContextManager: typeof import('../../config/contextManager').ContextManager;

describe('ContextProvider with local contexts', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  function makeContext(name: string, url = 'https://test.console.ves.volterra.io'): XCSHContext {
    return {
      name,
      apiUrl: url,
      apiToken: 'tok-abc123',
      defaultNamespace: 'default',
      version: 1,
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-tree-'));
    process.env = { ...originalEnv, XDG_CONFIG_HOME: path.join(tmpDir, 'global') };

    // Ensure global contexts directory exists
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.mkdirSync(globalCtxDir, { recursive: true, mode: 0o700 });

    jest.resetModules();

    const providerMod = require('../../tree/contextProvider');
    ContextProvider = providerMod.ContextProvider;
    ContextGroupItem = providerMod.ContextGroupItem;
    ContextTreeItem = providerMod.ContextTreeItem;

    const mgrMod = require('../../config/contextManager');
    ContextManager = mgrMod.ContextManager;
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ───────── flat list (no workspace folder) ─────────

  it('returns flat ContextTreeItem list when no workspaceFolder is set', async () => {
    // Write a global context
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'prod.json'), JSON.stringify(makeContext('prod')), { mode: 0o600 });

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);

    const children = await provider.getChildren();
    expect(children.length).toBe(1);
    expect(children[0]).toBeInstanceOf(ContextTreeItem);

    mgr.dispose();
  });

  // ───────── grouped tree ─────────

  it('returns two ContextGroupItem nodes when workspaceFolder has local contexts', async () => {
    // Create a global context
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'global-prod.json'), JSON.stringify(makeContext('global-prod')), {
      mode: 0o600,
    });

    // Create local context directory and a context
    const projDir = path.join(tmpDir, 'project');
    const localCtxDir = path.join(projDir, '.xcsh', 'contexts');
    fs.mkdirSync(localCtxDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(localCtxDir, 'local-dev.json'),
      JSON.stringify(makeContext('local-dev', 'https://local.example.com')),
      { mode: 0o600 },
    );

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);
    provider.setWorkspaceFolder(projDir);

    const children = await provider.getChildren();
    expect(children.length).toBe(2);
    expect(children[0]).toBeInstanceOf(ContextGroupItem);
    expect(children[1]).toBeInstanceOf(ContextGroupItem);

    // First group is "Project Contexts"
    const projectGroup = children[0] as InstanceType<typeof ContextGroupItem>;
    const projectItem = projectGroup.getTreeItem();
    expect(projectItem.label).toBe('Project Contexts');

    // Second group is "Global Contexts"
    const globalGroup = children[1] as InstanceType<typeof ContextGroupItem>;
    const globalItem = globalGroup.getTreeItem();
    expect(globalItem.label).toBe('Global Contexts');

    mgr.dispose();
  });

  it('returns project contexts as children of the project group', async () => {
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'global-prod.json'), JSON.stringify(makeContext('global-prod')), {
      mode: 0o600,
    });

    const projDir = path.join(tmpDir, 'project');
    const localCtxDir = path.join(projDir, '.xcsh', 'contexts');
    fs.mkdirSync(localCtxDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(localCtxDir, 'local-dev.json'),
      JSON.stringify(makeContext('local-dev', 'https://local.example.com')),
      { mode: 0o600 },
    );

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);
    provider.setWorkspaceFolder(projDir);

    const topLevel = await provider.getChildren();
    const projectGroup = topLevel[0] as InstanceType<typeof ContextGroupItem>;

    // Get children of the project group
    const projectChildren = await provider.getChildren(projectGroup);
    expect(projectChildren.length).toBe(1);
    expect(projectChildren[0]).toBeInstanceOf(ContextTreeItem);

    mgr.dispose();
  });

  it('returns global contexts as children of the global group', async () => {
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'g1.json'), JSON.stringify(makeContext('g1')), { mode: 0o600 });
    fs.writeFileSync(path.join(globalCtxDir, 'g2.json'), JSON.stringify(makeContext('g2')), { mode: 0o600 });

    const projDir = path.join(tmpDir, 'project');
    const localCtxDir = path.join(projDir, '.xcsh', 'contexts');
    fs.mkdirSync(localCtxDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(localCtxDir, 'local-dev.json'), JSON.stringify(makeContext('local-dev')), {
      mode: 0o600,
    });

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);
    provider.setWorkspaceFolder(projDir);

    const topLevel = await provider.getChildren();
    const globalGroup = topLevel[1] as InstanceType<typeof ContextGroupItem>;

    const globalChildren = await provider.getChildren(globalGroup);
    expect(globalChildren.length).toBe(2);
    expect(globalChildren.every((c) => c instanceof ContextTreeItem)).toBe(true);

    mgr.dispose();
  });

  // ───────── pointer contexts ─────────

  it('shows pointer description for pointer contexts', async () => {
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'shared-prod.json'), JSON.stringify(makeContext('shared-prod')), {
      mode: 0o600,
    });

    const projDir = path.join(tmpDir, 'project');
    const localCtxDir = path.join(projDir, '.xcsh', 'contexts');
    fs.mkdirSync(localCtxDir, { recursive: true, mode: 0o700 });

    // Write a pointer context
    const pointer = { context: 'shared-prod' };
    fs.writeFileSync(path.join(localCtxDir, 'shared-prod.json'), JSON.stringify(pointer), { mode: 0o600 });

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);
    provider.setWorkspaceFolder(projDir);

    const topLevel = await provider.getChildren();
    const projectGroup = topLevel[0] as InstanceType<typeof ContextGroupItem>;
    const projectChildren = await provider.getChildren(projectGroup);

    // The pointer context should show the global reference in description
    expect(projectChildren.length).toBe(1);
    const treeItem = projectChildren[0]!.getTreeItem();
    expect(treeItem.description).toContain('global:shared-prod');

    mgr.dispose();
  });

  // ───────── ContextTreeItem returns empty children ─────────

  it('returns empty array for ContextTreeItem children', async () => {
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'prod.json'), JSON.stringify(makeContext('prod')), { mode: 0o600 });

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);

    const children = await provider.getChildren();
    const leaf = children[0] as InstanceType<typeof ContextTreeItem>;

    const leafChildren = await provider.getChildren(leaf);
    expect(leafChildren).toEqual([]);

    mgr.dispose();
  });

  // ───────── falls back to flat when no local dir ─────────

  it('falls back to flat list when workspaceFolder is set but .xcsh/contexts does not exist', async () => {
    const globalCtxDir = path.join(tmpDir, 'global', 'xcsh', 'contexts');
    fs.writeFileSync(path.join(globalCtxDir, 'prod.json'), JSON.stringify(makeContext('prod')), { mode: 0o600 });

    const projDir = path.join(tmpDir, 'project');
    fs.mkdirSync(projDir, { recursive: true });
    // Note: no .xcsh/contexts/ directory

    const mgr = new ContextManager();
    const provider = new ContextProvider(mgr);
    provider.setWorkspaceFolder(projDir);

    const children = await provider.getChildren();
    expect(children.length).toBe(1);
    expect(children[0]).toBeInstanceOf(ContextTreeItem);

    mgr.dispose();
  });

  // ───────── ContextGroupItem properties ─────────

  it('ContextGroupItem has correct contextValue and collapsible state', () => {
    const group = new ContextGroupItem('Test Group', []);
    const item = group.getTreeItem();

    expect(item.contextValue).toBe('contextGroup');
    // TreeItemCollapsibleState.Expanded = 2
    expect(item.collapsibleState).toBe(2);
  });
});
