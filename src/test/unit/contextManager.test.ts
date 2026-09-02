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
  let secretStorage: ReturnType<typeof createSecretStorage>;
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
    secretStorage = createSecretStorage();
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

  function createSecretStorage(): {
    values: Map<string, string>;
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  } {
    const values = new Map<string, string>();
    return {
      values,
      get: (key) => Promise.resolve(values.get(key)),
      store: (key, value) => {
        values.set(key, value);
        return Promise.resolve();
      },
      delete: (key) => {
        values.delete(key);
        return Promise.resolve();
      },
    };
  }

  it('persists canonical owner-only credentials without using secret storage', async () => {
    const secretStorage = createSecretStorage();
    const mgr = new ContextManager(secretStorage);
    const apiToken = 'TEST_ONLY_TOKEN_VALUE';
    const envValue = 'TEST_ONLY_ENV_VALUE';

    await mgr.addContext(
      makeContext({
        name: 'secure-storage',
        apiToken,
        env: { XCSH_PRIVATE_VALUE: envValue },
        sensitiveKeys: ['XCSH_PRIVATE_VALUE'],
      }),
    );

    const raw = fs.readFileSync(path.join(contextsDir, 'secure-storage.json'), 'utf-8');
    expect(raw).toContain(apiToken);
    expect(raw).toContain(envValue);
    expect(raw).toContain('sensitiveKeys');
    expect(secretStorage.values.size).toBe(0);

    const hydrated = await mgr.getContext('secure-storage');
    expect(hydrated?.apiToken).toBe(apiToken);
    expect(hydrated?.env?.XCSH_PRIVATE_VALUE).toBe(envValue);
    mgr.dispose();
  });

  it('does not create or delete SecretStorage payloads for canonical contexts', async () => {
    const secretStorage = createSecretStorage();
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'delete-secret' }));
    expect(secretStorage.values.size).toBe(0);

    await mgr.deleteContext('delete-secret');

    expect(secretStorage.values.size).toBe(0);
    mgr.dispose();
  });

  // --------------- read operations ---------------

  it('returns empty list when no contexts exist', async () => {
    const mgr = new ContextManager(secretStorage);
    const list = await mgr.getContexts();
    expect(list).toEqual([]);
    mgr.dispose();
  });

  it('adds a context and retrieves it', async () => {
    const mgr = new ContextManager(secretStorage);
    const ctx = makeContext({ name: 'prod' });
    await mgr.addContext(ctx);

    const retrieved = await mgr.getContext('prod');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('prod');
    expect(retrieved?.apiUrl).toBe(ctx.apiUrl);
    expect(retrieved?.apiToken).toBe(ctx.apiToken);
    mgr.dispose();
  });

  it('normalizes a pasted full URL to its origin on save', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'pasted', apiUrl: 'https://host.example.com/web/home?iss=x' }));

    const onDisk = JSON.parse(fs.readFileSync(path.join(contextsDir, 'pasted.json'), 'utf-8')) as XCSHContext;
    expect(onDisk.apiUrl).toBe('https://host.example.com');
    mgr.dispose();
  });

  it('reads an existing canonical xcsh CLI context file', async () => {
    fs.mkdirSync(contextsDir, { recursive: true });
    const legacy: XCSHContext = {
      name: 'legacy',
      apiUrl: 'https://host.example.com/api/',
      apiToken: 'tok-abc123',
      defaultNamespace: 'default',
      version: 1,
    };
    fs.writeFileSync(path.join(contextsDir, 'legacy.json'), JSON.stringify(legacy, null, 2));

    const mgr = new ContextManager(secretStorage);
    const retrieved = await mgr.getContext('legacy');
    expect(retrieved).toMatchObject({ name: 'legacy', apiToken: 'tok-abc123', apiUrl: 'https://host.example.com' });
    mgr.dispose();
  });

  it('detects an occupied context filename even when its contents cannot be read', () => {
    fs.mkdirSync(contextsDir, { recursive: true });
    fs.writeFileSync(path.join(contextsDir, 'occupied.json'), '{not-json');

    const mgr = new ContextManager(secretStorage);
    expect(mgr.contextExists('occupied')).toBe(true);
    expect(mgr.contextExists('../occupied')).toBe(false);
    mgr.dispose();
  });

  it('atomically migrates a legacy global placeholder before deleting its secret', async () => {
    fs.mkdirSync(contextsDir, { recursive: true });
    const credentialId = '123e4567-e89b-42d3-a456-426614174000';
    const filePath = path.join(contextsDir, 'migrate.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        name: 'migrate',
        apiUrl: 'https://host.example.com',
        apiToken: '<SECRET_STORAGE>',
        credentialId,
        defaultNamespace: 'default',
        env: { XCSH_CONSOLE_PASSWORD: '<SECRET_STORAGE>' },
        version: 1,
      }),
    );
    secretStorage.values.set(
      `xcsh.context.credentials.${credentialId}`,
      JSON.stringify({ apiToken: 'opaque=', env: { XCSH_CONSOLE_PASSWORD: 'password' } }),
    );

    const mgr = new ContextManager(secretStorage);
    await expect(mgr.getContext('migrate')).resolves.toMatchObject({ apiToken: 'opaque=' });
    const migrated = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    expect(migrated.apiToken).toBe('opaque=');
    expect(migrated).not.toHaveProperty('credentialId');
    expect(secretStorage.values.size).toBe(0);
    mgr.dispose();
  });

  it('migrates a legacy global placeholder during direct active-context resolution', async () => {
    fs.mkdirSync(contextsDir, { recursive: true });
    const credentialId = '123e4567-e89b-42d3-a456-426614174010';
    const filePath = path.join(contextsDir, 'resolve-migrate.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        name: 'resolve-migrate',
        apiUrl: 'https://host.example.com',
        apiToken: '<SECRET_STORAGE>',
        credentialId,
        defaultNamespace: 'default',
        version: 1,
      }),
    );
    fs.writeFileSync(path.join(configDir, 'active_context'), 'resolve-migrate\n');
    secretStorage.values.set(
      `xcsh.context.credentials.${credentialId}`,
      JSON.stringify({ apiToken: 'resolved-token=', env: {} }),
    );

    const mgr = new ContextManager(secretStorage);
    await expect(mgr.resolveContext(undefined)).resolves.toMatchObject({
      source: 'global',
      context: { name: 'resolve-migrate', apiToken: 'resolved-token=' },
    });
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).not.toHaveProperty('credentialId');
    expect(secretStorage.values.size).toBe(0);
    mgr.dispose();
  });

  it('leaves a legacy placeholder untouched when its secret is missing', async () => {
    fs.mkdirSync(contextsDir, { recursive: true });
    const filePath = path.join(contextsDir, 'missing.json');
    const legacy = {
      name: 'missing',
      apiUrl: 'https://host.example.com',
      apiToken: '<SECRET_STORAGE>',
      credentialId: '123e4567-e89b-42d3-a456-426614174000',
      defaultNamespace: 'default',
      version: 1,
    };
    fs.writeFileSync(filePath, JSON.stringify(legacy));

    const mgr = new ContextManager(secretStorage);
    await expect(mgr.getContext('missing')).resolves.toBeNull();
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual(legacy);
    mgr.dispose();
  });

  it('keeps both verified canonical credentials and the legacy secret when secret cleanup is interrupted', async () => {
    fs.mkdirSync(contextsDir, { recursive: true });
    const credentialId = '123e4567-e89b-42d3-a456-426614174011';
    const filePath = path.join(contextsDir, 'interrupted.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        name: 'interrupted',
        apiUrl: 'https://host.example.com',
        apiToken: '<SECRET_STORAGE>',
        credentialId,
        defaultNamespace: 'default',
        version: 1,
      }),
    );
    const secretKey = `xcsh.context.credentials.${credentialId}`;
    secretStorage.values.set(secretKey, JSON.stringify({ apiToken: 'still-safe=', env: {} }));
    secretStorage.delete = jest.fn().mockRejectedValue(new Error('simulated interruption'));

    const mgr = new ContextManager(secretStorage);
    await expect(mgr.getContext('interrupted')).rejects.toMatchObject({ stage: 'migration' });
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toMatchObject({ apiToken: 'still-safe=' });
    expect(secretStorage.values.has(secretKey)).toBe(true);
    mgr.dispose();
  });

  it('migrates a conflicting legacy project context under a user-selected global name', async () => {
    const workspace = path.join(tmpDir, 'project');
    const localDir = path.join(workspace, '.xcsh', 'contexts');
    fs.mkdirSync(localDir, { recursive: true });
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'conflict', apiToken: 'existing-token' }));

    const credentialId = '123e4567-e89b-42d3-a456-426614174001';
    fs.writeFileSync(
      path.join(localDir, 'conflict.json'),
      JSON.stringify({
        name: 'conflict',
        apiUrl: 'https://different.example.test',
        apiToken: '<SECRET_STORAGE>',
        credentialId,
        defaultNamespace: 'default',
        version: 1,
      }),
    );
    fs.writeFileSync(path.join(localDir, 'active_context'), 'conflict\n');
    secretStorage.values.set(
      `xcsh.context.credentials.${credentialId}`,
      JSON.stringify({ apiToken: 'legacy-token', env: {} }),
    );
    const currentVscode = require('vscode') as typeof import('vscode');
    jest.mocked(currentVscode.window.showInputBox).mockResolvedValueOnce('project-conflict');

    await expect(mgr.getLocalContexts(workspace)).resolves.toEqual([
      expect.objectContaining({ name: 'project-conflict', apiToken: 'legacy-token' }),
    ]);
    expect(JSON.parse(fs.readFileSync(path.join(localDir, 'project-conflict.json'), 'utf-8'))).toEqual({
      context: 'project-conflict',
    });
    expect(fs.existsSync(path.join(localDir, 'conflict.json'))).toBe(false);
    expect(fs.readFileSync(path.join(localDir, 'active_context'), 'utf-8').trim()).toBe('project-conflict');
    expect((await mgr.getContext('project-conflict'))?.apiToken).toBe('legacy-token');
    expect(secretStorage.values.size).toBe(0);
    mgr.dispose();
  });

  it('writes context file with 0o600 permissions', async () => {
    const mgr = new ContextManager(secretStorage);
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
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'first' }));

    const activeName = await mgr.getActiveContextName();
    expect(activeName).toBe('first');
    mgr.dispose();
  });

  it('updates an existing context', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'up' }));
    await mgr.updateContext('up', { defaultNamespace: 'new-ns' });

    const updated = await mgr.getContext('up');
    expect(updated?.defaultNamespace).toBe('new-ns');
    // Other fields unchanged
    expect(updated?.apiUrl).toBe('https://test.console.ves.volterra.io');
    mgr.dispose();
  });

  it('deletes a context', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'del' }));
    await mgr.deleteContext('del');

    const list = await mgr.getContexts();
    expect(list).toEqual([]);
    expect(fs.existsSync(path.join(contextsDir, 'del.json'))).toBe(false);
    mgr.dispose();
  });

  it('switches active context', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'alpha' }));
    await mgr.addContext(makeContext({ name: 'beta' }));
    await mgr.setActiveContext('beta');

    expect(await mgr.getActiveContextName()).toBe('beta');
    mgr.dispose();
  });

  it('clears active when active context is deleted', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'gone' }));
    expect(await mgr.getActiveContextName()).toBe('gone');

    await mgr.deleteContext('gone');
    expect(await mgr.getActiveContextName()).toBeNull();
    mgr.dispose();
  });

  it('preserves unknown fields (knowledgeSources) for xcsh compat', async () => {
    const mgr = new ContextManager(secretStorage);
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
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.addContext(makeContext({ name: '../evil' }))).rejects.toThrow(/invalid/i);
    await expect(mgr.addContext(makeContext({ name: '' }))).rejects.toThrow(/invalid/i);
    await expect(mgr.addContext(makeContext({ name: 'list' }))).rejects.toThrow(/invalid/i);
    mgr.dispose();
  });

  it('rejects duplicate names', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'dup' }));
    await expect(mgr.addContext(makeContext({ name: 'dup' }))).rejects.toThrow(/already exists/i);
    mgr.dispose();
  });

  it('lists contexts sorted alphabetically', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'charlie' }));
    await mgr.addContext(makeContext({ name: 'alpha' }));
    await mgr.addContext(makeContext({ name: 'bravo' }));

    const list = await mgr.getContexts();
    expect(list.map((c: XCSHContext) => c.name)).toEqual(['alpha', 'bravo', 'charlie']);
    mgr.dispose();
  });

  // --------------- getActiveContext ---------------

  it('getActiveContext returns the full active context object', async () => {
    const mgr = new ContextManager(secretStorage);
    const ctx = makeContext({ name: 'active-one' });
    await mgr.addContext(ctx);

    const active = await mgr.getActiveContext();
    expect(active).not.toBeNull();
    expect(active?.name).toBe('active-one');
    expect(active?.apiUrl).toBe(ctx.apiUrl);
    mgr.dispose();
  });

  it('getActiveContext returns null when no active set', async () => {
    const mgr = new ContextManager(secretStorage);
    const active = await mgr.getActiveContext();
    expect(active).toBeNull();
    mgr.dispose();
  });

  // --------------- session activation gate ---------------

  it('does not auto-load a persisted active context in a fresh session', async () => {
    // Session 1: create + activate, leaving a persisted active_context pointer on disk.
    const mgr1 = new ContextManager(secretStorage);
    await mgr1.addContext(makeContext({ name: 'prod' }));
    expect(await mgr1.getActiveContextName()).toBe('prod');
    mgr1.dispose();

    // Session 2: a fresh manager must NOT auto-load the persisted pointer.
    const mgr2 = new ContextManager(secretStorage);
    expect(await mgr2.getActiveContextName()).toBeNull();
    expect(await mgr2.getActiveContext()).toBeNull();
    // The context still exists and is listable — only "active" is gated.
    expect((await mgr2.getContexts()).map((c) => c.name)).toContain('prod');
    // The persisted pointer file is left untouched (cross-tool safety).
    expect(fs.existsSync(path.join(configDir, 'active_context'))).toBe(true);

    // Explicit activation opens the gate for this session.
    await mgr2.setActiveContext('prod');
    expect(await mgr2.getActiveContextName()).toBe('prod');
    expect((await mgr2.getActiveContext())?.name).toBe('prod');
    mgr2.dispose();
  });

  it('isSessionActivated reflects the gate state', async () => {
    const mgr = new ContextManager(secretStorage);
    expect(mgr.isSessionActivated()).toBe(false);
    await mgr.addContext(makeContext({ name: 'prod' }));
    expect(mgr.isSessionActivated()).toBe(true);
    mgr.dispose();

    // A fresh session (new manager) starts un-activated even with a persisted pointer.
    const mgr2 = new ContextManager(secretStorage);
    expect(mgr2.isSessionActivated()).toBe(false);
    await mgr2.setActiveContext('prod');
    expect(mgr2.isSessionActivated()).toBe(true);
    mgr2.dispose();
  });

  it('creating any context activates it in the current session', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'alpha' }));
    expect(await mgr.getActiveContextName()).toBe('alpha');
    // A second create switches active to the newest (create = activate, any create).
    await mgr.addContext(makeContext({ name: 'bravo' }));
    expect(await mgr.getActiveContextName()).toBe('bravo');
    mgr.dispose();
  });

  // --------------- getTokenHealth ---------------

  it('getTokenHealth returns correct health for context', async () => {
    const mgr = new ContextManager(secretStorage);
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
    const mgr = new ContextManager(secretStorage);
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
    const mgr = new ContextManager(secretStorage);
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

    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'test-ctx' }));

    const result = await mgr.validateContext('test-ctx');
    expect(result).toBe(true);

    validateSpy.mockRestore();
    mgr.dispose();
  });

  it('validateContext throws when context does not exist', async () => {
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.validateContext('no-such-ctx')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- atomic writes ---------------

  it('uses atomic writes (no partial files left behind)', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'atomic' }));

    // Verify no .tmp files remain
    const files = fs.readdirSync(contextsDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);
    mgr.dispose();
  });

  // --------------- directory permissions ---------------

  it('creates contexts directory with 0o700 permissions', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'dirperms' }));

    const stat = fs.statSync(contextsDir);
    const perms = stat.mode & 0o777;
    if (process.platform !== 'win32') {
      expect(perms).toBe(0o700);
    }
    mgr.dispose();
  });

  it('creates a canonical global context plus a project pointer transactionally', async () => {
    const workspace = path.join(tmpDir, 'project');
    fs.mkdirSync(path.join(workspace, '.xcsh'), { recursive: true });
    const mgr = new ContextManager(secretStorage);

    await mgr.addGlobalContextAndLink(makeContext({ name: 'linked', apiToken: 'padded=' }), workspace);

    const global = JSON.parse(fs.readFileSync(path.join(contextsDir, 'linked.json'), 'utf-8')) as XCSHContext;
    const pointer = JSON.parse(
      fs.readFileSync(path.join(workspace, '.xcsh', 'contexts', 'linked.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(global.apiToken).toBe('padded=');
    expect(pointer).toEqual({ context: 'linked' });
    expect(fs.statSync(path.join(workspace, '.xcsh', 'contexts', 'linked.json')).mode & 0o777).toBe(0o600);
    mgr.dispose();
  });

  it('removes the new global context and restores pointers when project linking fails', async () => {
    const workspace = path.join(tmpDir, 'project');
    fs.mkdirSync(path.join(workspace, '.xcsh'), { recursive: true });
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'prior' }));
    jest.spyOn(mgr, 'linkGlobalContext').mockRejectedValueOnce(new Error('simulated pointer failure'));

    await expect(mgr.addGlobalContextAndLink(makeContext({ name: 'rollback' }), workspace)).rejects.toThrow(
      'simulated pointer failure',
    );
    expect(fs.existsSync(path.join(contextsDir, 'rollback.json'))).toBe(false);
    expect(fs.readFileSync(path.join(configDir, 'active_context'), 'utf-8').trim()).toBe('prior');
    mgr.dispose();
  });

  // --------------- update nonexistent ---------------

  it('throws when updating a context that does not exist', async () => {
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.updateContext('ghost', { defaultNamespace: 'ns' })).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- setActiveContext with bad name ---------------

  it('throws when setting active to a nonexistent context', async () => {
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.setActiveContext('nope')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- env var management ---------------

  it('sets a new env var on a context', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'env-ctx' }));
    await mgr.setContextEnv('env-ctx', 'XCSH_LB_NAME', 'my-lb');

    const onDisk = JSON.parse(fs.readFileSync(path.join(contextsDir, 'env-ctx.json'), 'utf-8')) as XCSHContext;
    expect(onDisk.env).toEqual({ XCSH_LB_NAME: 'my-lb' });
    expect(secretStorage.values.size).toBe(0);
    mgr.dispose();
  });

  it('overwrites an existing env var and preserves the others', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'env-ctx', env: { A: '1', B: '2' } }));
    await mgr.setContextEnv('env-ctx', 'A', '99');

    const ctx = await mgr.getContext('env-ctx');
    expect(ctx?.env).toEqual({ A: '99', B: '2' });
    mgr.dispose();
  });

  it('unsets an env var without touching the rest', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'env-ctx', env: { A: '1', B: '2' } }));
    await mgr.unsetContextEnv('env-ctx', 'A');

    const ctx = await mgr.getContext('env-ctx');
    expect(ctx?.env).toEqual({ B: '2' });
    mgr.dispose();
  });

  it('unset is a no-op for an absent key', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'env-ctx', env: { A: '1' } }));
    await mgr.unsetContextEnv('env-ctx', 'MISSING');

    const ctx = await mgr.getContext('env-ctx');
    expect(ctx?.env).toEqual({ A: '1' });
    mgr.dispose();
  });

  it('rejects reserved env keys', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'env-ctx' }));
    await expect(mgr.setContextEnv('env-ctx', 'XCSH_API_TOKEN', 'x')).rejects.toThrow(/reserved/i);
    mgr.dispose();
  });

  it('rejects malformed env keys', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'env-ctx' }));
    await expect(mgr.setContextEnv('env-ctx', '1BAD', 'x')).rejects.toThrow(/invalid/i);
    await expect(mgr.setContextEnv('env-ctx', 'has space', 'x')).rejects.toThrow(/invalid/i);
    mgr.dispose();
  });

  it('throws when setting env on a nonexistent context', async () => {
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.setContextEnv('nope', 'A', '1')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- namespace switch ---------------

  it('switches the default namespace', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'ns-ctx', defaultNamespace: 'old' }));
    await mgr.setContextNamespace('ns-ctx', 'new-ns');

    const ctx = await mgr.getContext('ns-ctx');
    expect(ctx?.defaultNamespace).toBe('new-ns');
    mgr.dispose();
  });

  it('trims the namespace before saving', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'ns-ctx' }));
    await mgr.setContextNamespace('ns-ctx', '  spaced  ');

    const ctx = await mgr.getContext('ns-ctx');
    expect(ctx?.defaultNamespace).toBe('spaced');
    mgr.dispose();
  });

  it('rejects an empty namespace', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'ns-ctx' }));
    await expect(mgr.setContextNamespace('ns-ctx', '   ')).rejects.toThrow(/empty/i);
    mgr.dispose();
  });

  it('throws when switching namespace on a nonexistent context', async () => {
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.setContextNamespace('nope', 'ns')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });

  // --------------- rename ---------------

  it('renames a context, preserving fields and removing the old name', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'old', defaultNamespace: 'keep-ns', env: { A: '1' } }));
    await mgr.renameContext('old', 'fresh');

    expect(await mgr.getContext('old')).toBeNull();
    const renamed = await mgr.getContext('fresh');
    expect(renamed?.name).toBe('fresh');
    expect(renamed?.defaultNamespace).toBe('keep-ns');
    expect(renamed?.env).toEqual({ A: '1' });
    mgr.dispose();
  });

  it('moves the active pointer when renaming the active context', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'active1' }));
    await mgr.addContext(makeContext({ name: 'other' }));
    await mgr.setActiveContext('active1');

    await mgr.renameContext('active1', 'active2');
    expect(await mgr.getActiveContextName()).toBe('active2');
    mgr.dispose();
  });

  it('leaves the active pointer alone when renaming a non-active context', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'act' }));
    await mgr.addContext(makeContext({ name: 'idle' }));
    await mgr.setActiveContext('act');

    await mgr.renameContext('idle', 'idle2');
    expect(await mgr.getActiveContextName()).toBe('act');
    mgr.dispose();
  });

  it('rejects an invalid or duplicate new name', async () => {
    const mgr = new ContextManager(secretStorage);
    await mgr.addContext(makeContext({ name: 'src' }));
    await mgr.addContext(makeContext({ name: 'taken' }));

    await expect(mgr.renameContext('src', '../evil')).rejects.toThrow(/invalid/i);
    await expect(mgr.renameContext('src', 'taken')).rejects.toThrow(/already exists/i);
    // src is untouched after failed renames
    expect(await mgr.getContext('src')).not.toBeNull();
    mgr.dispose();
  });

  it('throws when renaming a nonexistent context', async () => {
    const mgr = new ContextManager(secretStorage);
    await expect(mgr.renameContext('nope', 'whatever')).rejects.toThrow(/not found/i);
    mgr.dispose();
  });
});
