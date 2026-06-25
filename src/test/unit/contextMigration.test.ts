// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// We will import migrateProfilesToContexts after setting XDG_CONFIG_HOME in beforeEach
let migrateProfilesToContexts: typeof import('../../config/contextMigration').migrateProfilesToContexts;

describe('contextMigration', () => {
  let tmpDir: string;
  let configDir: string;
  let profilesDir: string;
  let contextsDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-migration-test-'));
    configDir = path.join(tmpDir, 'xcsh');
    profilesDir = path.join(configDir, 'profiles');
    contextsDir = path.join(configDir, 'contexts');
    process.env = { ...originalEnv, XDG_CONFIG_HOME: tmpDir };

    // Reset the module cache so contextPaths re-reads XDG_CONFIG_HOME
    jest.resetModules();

    // Re-import after env is set so contextPaths picks up XDG_CONFIG_HOME
    const mod = require('../../config/contextMigration');
    migrateProfilesToContexts = mod.migrateProfilesToContexts;
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeProfile(name: string, data: Record<string, unknown>): void {
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(path.join(profilesDir, `${name}.json`), JSON.stringify(data, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 1: Migrates token-based profiles to contexts
  // ───────────────────────────────────────────────────────────────────────────

  it('migrates token-based profiles to context files with version=1 and apiToken preserved', () => {
    writeProfile('prod', {
      name: 'prod',
      apiUrl: 'https://prod.console.ves.volterra.io',
      apiToken: 'tok-prod-secret',
      defaultNamespace: 'default',
    });

    const result = migrateProfilesToContexts();

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.skippedNames).toEqual([]);

    // Context file must exist
    const ctxFile = path.join(contextsDir, 'prod.json');
    expect(fs.existsSync(ctxFile)).toBe(true);

    const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf-8'));
    expect(ctx.version).toBe(1);
    expect(ctx.apiToken).toBe('tok-prod-secret');
    expect(ctx.apiUrl).toBe('https://prod.console.ves.volterra.io');
    expect(ctx.name).toBe('prod');
    expect(ctx.metadata).toBeDefined();
    expect(ctx.metadata.createdAt).toBeDefined();
    // createdAt must be a valid ISO date
    expect(() => new Date(ctx.metadata.createdAt).toISOString()).not.toThrow();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 2: Skips profiles with certificate auth fields
  // ───────────────────────────────────────────────────────────────────────────

  it('skips profiles with p12Bundle and tracks their names', () => {
    writeProfile('cert-profile', {
      name: 'cert-profile',
      apiUrl: 'https://test.console.ves.volterra.io',
      p12Bundle: 'base64encodedcert==',
      defaultNamespace: 'default',
    });
    writeProfile('token-profile', {
      name: 'token-profile',
      apiUrl: 'https://test.console.ves.volterra.io',
      apiToken: 'tok-abc123',
      defaultNamespace: 'default',
    });

    const result = migrateProfilesToContexts();

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.skippedNames).toContain('cert-profile');

    // cert-profile must NOT be migrated
    expect(fs.existsSync(path.join(contextsDir, 'cert-profile.json'))).toBe(false);
    // token-profile must be migrated
    expect(fs.existsSync(path.join(contextsDir, 'token-profile.json'))).toBe(true);
  });

  it('skips profiles with cert and key fields and tracks their names', () => {
    writeProfile('mtls-profile', {
      name: 'mtls-profile',
      apiUrl: 'https://test.console.ves.volterra.io',
      cert: '-----BEGIN CERTIFICATE-----\nMIIB...',
      key: '-----BEGIN PRIVATE KEY-----\nMIIE...',
      defaultNamespace: 'default',
    });

    const result = migrateProfilesToContexts();

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedNames).toContain('mtls-profile');
    expect(fs.existsSync(path.join(contextsDir, 'mtls-profile.json'))).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 3: Migrates active_profile to active_context
  // ───────────────────────────────────────────────────────────────────────────

  it('copies active_profile to active_context when profile is migrated', () => {
    writeProfile('staging', {
      name: 'staging',
      apiUrl: 'https://staging.console.ves.volterra.io',
      apiToken: 'tok-staging',
      defaultNamespace: 'default',
    });
    // Write active_profile file
    fs.writeFileSync(path.join(configDir, 'active_profile'), 'staging', {
      encoding: 'utf-8',
      mode: 0o600,
    });

    migrateProfilesToContexts();

    const activeContextPath = path.join(configDir, 'active_context');
    expect(fs.existsSync(activeContextPath)).toBe(true);
    const activeCtx = fs.readFileSync(activeContextPath, 'utf-8').trim();
    expect(activeCtx).toBe('staging');
  });

  it('does not write active_context when there is no active_profile', () => {
    writeProfile('dev', {
      name: 'dev',
      apiUrl: 'https://dev.console.ves.volterra.io',
      apiToken: 'tok-dev',
      defaultNamespace: 'default',
    });
    // No active_profile file written

    migrateProfilesToContexts();

    const activeContextPath = path.join(configDir, 'active_context');
    expect(fs.existsSync(activeContextPath)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 4: Does nothing when profiles directory does not exist
  // ───────────────────────────────────────────────────────────────────────────

  it('returns zero counts when profiles directory does not exist', () => {
    // No profiles directory created

    const result = migrateProfilesToContexts();

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.skippedNames).toEqual([]);
    expect(result.skippedReason).toBeUndefined();
    // contexts dir should not be created
    expect(fs.existsSync(contextsDir)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 5: Does nothing when contexts directory already has files
  // ───────────────────────────────────────────────────────────────────────────

  it('returns skippedReason=contexts_exist when contexts directory already has json files', () => {
    // Pre-populate contexts dir (xcsh already configured)
    fs.mkdirSync(contextsDir, { recursive: true });
    fs.writeFileSync(path.join(contextsDir, 'existing.json'), '{"name":"existing"}', {
      encoding: 'utf-8',
      mode: 0o600,
    });

    // Also have a profiles dir to confirm it is ignored
    writeProfile('should-not-migrate', {
      name: 'should-not-migrate',
      apiUrl: 'https://test.console.ves.volterra.io',
      apiToken: 'tok-abc',
      defaultNamespace: 'default',
    });

    const result = migrateProfilesToContexts();

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.skippedNames).toEqual([]);
    expect(result.skippedReason).toBe('contexts_exist');

    // The pre-existing context must NOT be overwritten or removed
    expect(fs.existsSync(path.join(contextsDir, 'existing.json'))).toBe(true);
    // The profile must NOT have been migrated
    expect(fs.existsSync(path.join(contextsDir, 'should-not-migrate.json'))).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Additional: context files are written with 0o600 permissions
  // ───────────────────────────────────────────────────────────────────────────

  it('writes migrated context files with 0o600 permissions', () => {
    writeProfile('secure', {
      name: 'secure',
      apiUrl: 'https://test.console.ves.volterra.io',
      apiToken: 'tok-secure',
      defaultNamespace: 'default',
    });

    migrateProfilesToContexts();

    const ctxFile = path.join(contextsDir, 'secure.json');
    expect(fs.existsSync(ctxFile)).toBe(true);

    if (process.platform !== 'win32') {
      const stat = fs.statSync(ctxFile);
      const perms = stat.mode & 0o777;
      expect(perms).toBe(0o600);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Additional: multiple profiles migrated in one pass
  // ───────────────────────────────────────────────────────────────────────────

  it('migrates multiple token-based profiles in a single call', () => {
    writeProfile('alpha', {
      name: 'alpha',
      apiUrl: 'https://alpha.console.ves.volterra.io',
      apiToken: 'tok-alpha',
      defaultNamespace: 'default',
    });
    writeProfile('beta', {
      name: 'beta',
      apiUrl: 'https://beta.console.ves.volterra.io',
      apiToken: 'tok-beta',
      defaultNamespace: 'ns-beta',
    });

    const result = migrateProfilesToContexts();

    expect(result.migrated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.skippedNames).toEqual([]);

    for (const name of ['alpha', 'beta']) {
      const ctxFile = path.join(contextsDir, `${name}.json`);
      expect(fs.existsSync(ctxFile)).toBe(true);
      const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf-8'));
      expect(ctx.version).toBe(1);
    }
  });
});
