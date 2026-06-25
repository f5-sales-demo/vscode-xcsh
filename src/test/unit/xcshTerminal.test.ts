// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { XCSHContext } from '../../config/contextTypes';
import { buildTerminalEnv } from '../../xcsh/terminalIntegration';

describe('buildTerminalEnv', () => {
  it('builds env vars correctly from context', () => {
    const ctx: XCSHContext = {
      name: 'staging',
      apiUrl: 'https://acme.console.ves.volterra.io/api',
      apiToken: 'tok-abc-123',
      defaultNamespace: 'web-ns',
    };

    const env = buildTerminalEnv(ctx);

    expect(env.XCSH_API_URL).toBe('https://acme.console.ves.volterra.io/api');
    expect(env.XCSH_API_TOKEN).toBe('tok-abc-123');
    expect(env.XCSH_NAMESPACE).toBe('web-ns');
    expect(env.XCSH_TENANT).toBe('acme');
    expect(env.XCSH_CONTEXT_NAME).toBe('staging');
  });

  it('handles dotless hostname (tenant undefined)', () => {
    const ctx: XCSHContext = {
      name: 'local',
      apiUrl: 'https://localhost/api',
      apiToken: 'tok-local',
      defaultNamespace: 'default',
    };

    const env = buildTerminalEnv(ctx);

    expect(env.XCSH_API_URL).toBe('https://localhost/api');
    expect(env.XCSH_TENANT).toBeUndefined();
    expect(env.XCSH_CONTEXT_NAME).toBe('local');
  });

  it('includes all expected keys for valid context', () => {
    const ctx: XCSHContext = {
      name: 'prod',
      apiUrl: 'https://tenant1.console.ves.volterra.io/api',
      apiToken: 'tok-prod',
      defaultNamespace: 'production',
    };

    const env = buildTerminalEnv(ctx);

    expect(Object.keys(env)).toEqual(
      expect.arrayContaining(['XCSH_API_URL', 'XCSH_API_TOKEN', 'XCSH_NAMESPACE', 'XCSH_TENANT', 'XCSH_CONTEXT_NAME']),
    );
  });

  it('injects generic env vars including web-console auth credentials', () => {
    const ctx: XCSHContext = {
      name: 'auth',
      apiUrl: 'https://acme.console.ves.volterra.io/api',
      apiToken: 'tok',
      defaultNamespace: 'system',
      env: {
        XCSH_USERNAME: 'console-user@example.com',
        XCSH_CONSOLE_PASSWORD: 's3cret',
        XCSH_EMAIL: 'user@example.com',
      },
    };

    const env = buildTerminalEnv(ctx);

    expect(env.XCSH_USERNAME).toBe('console-user@example.com');
    expect(env.XCSH_CONSOLE_PASSWORD).toBe('s3cret');
    expect(env.XCSH_EMAIL).toBe('user@example.com');
  });

  it('never lets a context env shadow reserved control vars', () => {
    const ctx: XCSHContext = {
      name: 'shadow',
      apiUrl: 'https://acme.console.ves.volterra.io/api',
      apiToken: 'real-token',
      defaultNamespace: 'system',
      // These reserved keys must be ignored; the core fields win.
      env: { XCSH_API_TOKEN: 'EVIL', XCSH_TENANT: 'evil', XCSH_NAMESPACE: 'evil' },
    };

    const env = buildTerminalEnv(ctx);

    expect(env.XCSH_API_TOKEN).toBe('real-token');
    expect(env.XCSH_TENANT).toBe('acme');
    expect(env.XCSH_NAMESPACE).toBe('system');
  });

  it('only injects XCSH_ keys — refuses hijack vars and other non-XCSH keys', () => {
    const ctx: XCSHContext = {
      name: 'malicious',
      apiUrl: 'https://acme.console.ves.volterra.io/api',
      apiToken: 'tok',
      defaultNamespace: 'system',
      env: {
        LD_PRELOAD: '/tmp/evil.so',
        DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib',
        NODE_OPTIONS: '--require /tmp/evil.js',
        PATH: '/tmp/evil/bin',
        GLOBAL_THING: 'x',
        XCSH_SAFE: 'ok',
      },
    };

    const env = buildTerminalEnv(ctx);

    expect(env.LD_PRELOAD).toBeUndefined();
    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.PATH).toBeUndefined();
    // Non-XCSH benign keys are also refused by the allowlist.
    expect(env.GLOBAL_THING).toBeUndefined();
    // XCSH_-namespaced keys still flow through.
    expect(env.XCSH_SAFE).toBe('ok');
  });
});
