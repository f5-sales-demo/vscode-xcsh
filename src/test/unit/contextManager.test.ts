// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { XCSHContext } from '../../config/contextTypes';

// We will import ContextManager after setting XDG_CONFIG_HOME in beforeEach
let ContextManager: typeof import('../../config/contextManager').ContextManager;
let TokenAuthProvider: typeof import('../../api/auth/tokenAuth').TokenAuthProvider;

describe('ContextManager', () => {
  let tmpDir: string;
  let configDir: string;
  let contextsDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-ctx-test-'));
    configDir = path.join(tmpDir, 'xcsh');
    contextsDir = path.join(configDir, 'contexts');
    process.env = { ...originalEnv, XDG_CONFIG_HOME: tmpDir };

    // Reset the module cache so contextPaths re-reads XDG_CONFIG_HOME
    jest.resetModules();

    // Re-import after env is set so contextPaths picks up XDG_CONFIG_HOME
    const mod = require('../../config/contextManager');
    ContextManager = mod.ContextManager;

    const authMod = require('../../api/auth/tokenAuth');
    TokenAuthProvider = authMod.TokenAuthProvider;
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeContext(overrides: Partial<XCSHContext> = {}): XCSHContext {
    return {
      name: 'test-ctx',
      apiUrl: 'https://test.console.ves.volterra.io',
      apiToken: 'tok-abc123',
      defaultNamespace: 'default',
      version: 1,
      ...overrides,
    };
  }

  // --------------- read operations ---------------

  it('returns empty list when no contexts exist', async () => {
    const mgr = new ContextManager();
    const list = await mgr.getContexts();
    expect(list).toEqual([]);
    mgr.dispose();
  });

  it('adds a context and retrieves it', async () => {
    const mgr = new ContextManager();
    const ctx = makeContext({ name: 'prod' });
    await mgr.addContext(ctx);

    const retrieved = await mgr.getContext('prod');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('prod');
    expect(retrieved?.apiUrl).toBe(ctx.apiUrl);
    expect(retrieved?.apiToken).toBe(ctx.apiToken);
    mgr.dispose();
  });

  it('writes context file with 0o600 permissions', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'secure' }));

    const filePath = path.join(contextsDir, 'secure.json');
    const stat = fs.statSync(filePath);
    // Node reports mode including file type bits; mask to permission bits
    const perms = stat.mode & 0o777;
    if (process.platform !== 'win32') {
      expect(perms).toBe(0o600);
    }
    mgr.dispose();
  });

  it('sets first added context as active', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'first' }));

    const activeName = await mgr.getActiveContextName();
    expect(activeName).toBe('first');
    mgr.dispose();
  });

  it('updates an existing context', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'up' }));
    await mgr.updateContext('up', { defaultNamespace: 'new-ns' });

    const updated = await mgr.getContext('up');
    expect(updated?.defaultNamespace).toBe('new-ns');
    // Other fields unchanged
    expect(updated?.apiUrl).toBe('https://test.console.ves.volterra.io');
    mgr.dispose();
  });

  it('deletes a context', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'del' }));
    await mgr.deleteContext('del');

    const list = await mgr.getContexts();
    expect(list).toEqual([]);
    expect(fs.existsSync(path.join(contextsDir, 'del.json'))).toBe(false);
    mgr.dispose();
  });

  it('switches active context', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'alpha' }));
    await mgr.addContext(makeContext({ name: 'beta' }));
    await mgr.setActiveContext('beta');

    expect(await mgr.getActiveContextName()).toBe('beta');
    mgr.dispose();
  });

  it('clears active when active context is deleted', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'gone' }));
    expect(await mgr.getActiveContextName()).toBe('gone');

    await mgr.deleteContext('gone');
    expect(await mgr.getActiveContextName()).toBeNull();
    mgr.dispose();
  });

  it('preserves unknown fields (knowledgeSources) for xcsh compat', async () => {
    const mgr = new ContextManager();
    const ctx = makeContext({
      name: 'compat',
      knowledgeSources: [{ url: 'https://example.com/llms.txt', label: 'docs', type: 'llms-txt' }],
    });
    await mgr.addContext(ctx);

    const retrieved = await mgr.getContext('compat');
    expect(retrieved?.knowledgeSources).toEqual([
      { url: 'https://example.com/llms.txt', label: 'docs', type: 'llms-txt' },
    ]);

    // Also check the raw file on disk for any extra unknown keys
    const rawJson = JSON.parse(fs.readFileSync(path.join(contextsDir, 'compat.json'), 'utf-8'));
    expect(rawJson.knowledgeSources).toBeDefined();
    mgr.dispose();
  });

  it('rejects invalid context names', async () => {
    const mgr = new ContextManager();
    await expect(mgr.addContext(makeContext({ name: '../evil' }))).rejects.toThrow(/invalid/i);
    await expect(mgr.addContext(makeContext({ name: '' }))).rejects.toThrow(/invalid/i);
    await expect(mgr.addContext(makeContext({ name: 'list' }))).rejects.toThrow(/invalid/i);
    mgr.dispose();
  });

  it('rejects duplicate names', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'dup' }));
    await expect(mgr.addContext(makeContext({ name: 'dup' }))).rejects.toThrow(/already exists/i);
    mgr.dispose();
  });

  it('lists contexts sorted alphabetically', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'charlie' }));
    await mgr.addContext(makeContext({ name: 'alpha' }));
    await mgr.addContext(makeContext({ name: 'bravo' }));

    const list = await mgr.getContexts();
    expect(list.map((c: XCSHContext) => c.name)).toEqual(['alpha', 'bravo', 'charlie']);
    mgr.dispose();
  });

  // --------------- getActiveContext ---------------

  it('getActiveContext returns the full active context object', async () => {
    const mgr = new ContextManager();
    const ctx = makeContext({ name: 'active-one' });
    await mgr.addContext(ctx);

    const active = await mgr.getActiveContext();
    expect(active).not.toBeNull();
    expect(active?.name).toBe('active-one');
    expect(active?.apiUrl).toBe(ctx.apiUrl);
    mgr.dispose();
  });

  it('getActiveContext returns null when no active set', async () => {
    const mgr = new ContextManager();
    const active = await mgr.getActiveContext();
    expect(active).toBeNull();
    mgr.dispose();
  });

  // --------------- getTokenHealth ---------------

  it('getTokenHealth returns correct health for context', async () => {
    const mgr = new ContextManager();
    const ctx = makeContext({
      name: 'healthy',
      metadata: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
    });
    await mgr.addContext(ctx);

    const retrieved = await mgr.getContext('healthy');
    expect(retrieved).not.toBeNull();
    if (retrieved === null) {
      throw new Error('unreachable');
    }
    const health = mgr.getTokenHealth(retrieved);
    expect(health).toBe('ok');
    mgr.dispose();
  });

  it('getTokenHealth returns expiring for context expiring within 7 days', async () => {
    const mgr = new ContextManager();
    const ctx = makeContext({
      name: 'expiring-soon',
      metadata: { expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
    });
    await mgr.addContext(ctx);

    const retrieved = await mgr.getContext('expiring-soon');
    expect(retrieved).not.toBeNull();
    if (retrieved === null) {
      throw new Error('unreachable');
    }
    const health = mgr.getTokenHealth(retrieved);
    expect(health).toBe('expiring');
    mgr.dispose();
  });

  // --------------- getClient ---------------

  it('getClient returns the same cached instance on repeated calls', async () => {
    // TokenAuthProvider and XCSHClient constructors do not make network calls,
    // so no https stubbing is needed — only getClient caching behaviour is tested.
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'test-ctx' }));

    const client1 = await mgr.getClient('test-ctx');
    const client2 = await mgr.getClient('test-ctx');

    expect(client1).toBe(client2);

    mgr.dispose();
  });

  // --------------- validateContext ---------------

  it('validateContext returns true when auth validation succeeds', async () => {
    // Spy on TokenAuthProvider.prototype.validate to avoid real network calls
    const validateSpy = jest.spyOn(TokenAuthProvider.prototype, 'validate').mockResolvedValue(true);

    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'test-ctx' }));

    const result = await mgr.validateContext('test-ctx');
    expect(result).toBe(true);

    validateSpy.mockRestore();
    mgr.dispose();
  });

  it('validateContext throws when context does not exist', async () => {
    const mgr = new ContextManager();
    await expect(mgr.validateContext('no-such-ctx')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- atomic writes ---------------

  it('uses atomic writes (no partial files left behind)', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'atomic' }));

    // Verify no .tmp files remain
    const files = fs.readdirSync(contextsDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);
    mgr.dispose();
  });

  // --------------- directory permissions ---------------

  it('creates contexts directory with 0o700 permissions', async () => {
    const mgr = new ContextManager();
    await mgr.addContext(makeContext({ name: 'dirperms' }));

    const stat = fs.statSync(contextsDir);
    const perms = stat.mode & 0o777;
    if (process.platform !== 'win32') {
      expect(perms).toBe(0o700);
    }
    mgr.dispose();
  });

  // --------------- update nonexistent ---------------

  it('throws when updating a context that does not exist', async () => {
    const mgr = new ContextManager();
    await expect(mgr.updateContext('ghost', { defaultNamespace: 'ns' })).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- setActiveContext with bad name ---------------

  it('throws when setting active to a nonexistent context', async () => {
    const mgr = new ContextManager();
    await expect(mgr.setActiveContext('nope')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });
});
