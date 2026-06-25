// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Types matching the spec — same as packages/utils
interface PointerContext {
  context: string;
  overrides?: { defaultNamespace?: string; env?: Record<string, string> };
}

describe('contextResolver', () => {
  let tmpDir: string;
  let projectDir: string;
  let globalConfigDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-vsc-resolver-'));
    projectDir = path.join(tmpDir, 'project');
    globalConfigDir = path.join(tmpDir, 'global-config');

    fs.mkdirSync(path.join(projectDir, '.xcsh', 'contexts'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(globalConfigDir, 'xcsh', 'contexts'), { recursive: true, mode: 0o700 });

    process.env.XDG_CONFIG_HOME = globalConfigDir;
    delete process.env.XCSH_API_URL;
    delete process.env.XCSH_API_TOKEN;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves local inline context over global', async () => {
    // Reset modules to pick up new XDG_CONFIG_HOME
    jest.resetModules();
    const { resolveContext } = require('../../config/contextResolver');

    const localCtx = { name: 'local-dev', apiUrl: 'https://local.com', apiToken: 'tok', defaultNamespace: 'ns' };
    fs.writeFileSync(path.join(projectDir, '.xcsh', 'contexts', 'local-dev.json'), JSON.stringify(localCtx), {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(projectDir, '.xcsh', 'contexts', 'active_context'), 'local-dev', { mode: 0o600 });

    const result = await resolveContext(projectDir);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local');
    expect(result!.context.name).toBe('local-dev');
  });

  it('resolves pointer context through to global', async () => {
    jest.resetModules();
    const { resolveContext } = require('../../config/contextResolver');

    const globalCtx = {
      name: 'prod-tenant',
      apiUrl: 'https://prod.com',
      apiToken: 'ptok',
      defaultNamespace: 'system',
      env: { G: 'val' },
    };
    fs.writeFileSync(path.join(globalConfigDir, 'xcsh', 'contexts', 'prod-tenant.json'), JSON.stringify(globalCtx), {
      mode: 0o600,
    });

    const pointer: PointerContext = {
      context: 'prod-tenant',
      overrides: { defaultNamespace: 'my-ns', env: { L: 'local' } },
    };
    fs.writeFileSync(path.join(projectDir, '.xcsh', 'contexts', 'staging.json'), JSON.stringify(pointer), {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(projectDir, '.xcsh', 'contexts', 'active_context'), 'staging', { mode: 0o600 });

    const result = await resolveContext(projectDir);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('local');
    expect(result!.context.defaultNamespace).toBe('my-ns');
    expect(result!.context.env).toEqual({ G: 'val', L: 'local' });
  });

  it('returns env source when XCSH_API_URL and XCSH_API_TOKEN are set', async () => {
    process.env.XCSH_API_URL = 'https://env.example.com';
    process.env.XCSH_API_TOKEN = 'env-token';
    jest.resetModules();
    const { resolveContext } = require('../../config/contextResolver');

    const result = await resolveContext(projectDir);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('env');
    expect(result!.context.apiUrl).toBe('https://env.example.com');
    expect(result!.context.apiToken).toBe('env-token');
  });

  it('falls back to global when no local context exists', async () => {
    jest.resetModules();
    const { resolveContext } = require('../../config/contextResolver');

    const globalCtx = {
      name: 'global-ctx',
      apiUrl: 'https://global.com',
      apiToken: 'gtok',
      defaultNamespace: 'default',
    };
    fs.writeFileSync(path.join(globalConfigDir, 'xcsh', 'contexts', 'global-ctx.json'), JSON.stringify(globalCtx), {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(globalConfigDir, 'xcsh', 'active_context'), 'global-ctx', { mode: 0o600 });

    const result = await resolveContext(projectDir);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('global');
    expect(result!.context.name).toBe('global-ctx');
  });

  it('returns null when nothing is configured', async () => {
    jest.resetModules();
    const { resolveContext } = require('../../config/contextResolver');

    const result = await resolveContext(undefined);
    expect(result).toBeNull();
  });

  it('isPointerContext detects pointer objects', () => {
    jest.resetModules();
    const { isPointerContext } = require('../../config/contextResolver');

    expect(isPointerContext({ context: 'prod' })).toBe(true);
    expect(isPointerContext({ context: 'prod', overrides: { defaultNamespace: 'ns' } })).toBe(true);
    expect(isPointerContext({ apiUrl: 'https://x.com' })).toBe(false);
    expect(isPointerContext(null)).toBe(false);
    expect(isPointerContext('string')).toBe(false);
  });

  it('isInlineContext detects inline context objects', () => {
    jest.resetModules();
    const { isInlineContext } = require('../../config/contextResolver');

    expect(isInlineContext({ apiUrl: 'https://x.com', apiToken: 'tok', name: 'n', defaultNamespace: 'ns' })).toBe(true);
    expect(isInlineContext({ context: 'pointer-ref' })).toBe(false);
    expect(isInlineContext(null)).toBe(false);
  });

  it('mergePointerOverrides merges env additively', () => {
    jest.resetModules();
    const { mergePointerOverrides } = require('../../config/contextResolver');

    const base = {
      name: 'base',
      apiUrl: 'https://b.com',
      apiToken: 'bt',
      defaultNamespace: 'old',
      env: { A: '1', B: '2' },
    };
    const result = mergePointerOverrides(base, { defaultNamespace: 'new', env: { B: 'override', C: '3' } });

    expect(result.defaultNamespace).toBe('new');
    expect(result.env).toEqual({ A: '1', B: 'override', C: '3' });
    // Base should not be mutated
    expect(base.defaultNamespace).toBe('old');
  });
});
