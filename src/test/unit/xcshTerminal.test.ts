// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { F5XCContext } from '../../config/contextTypes';
import { buildTerminalEnv } from '../../xcsh/terminalIntegration';

describe('buildTerminalEnv', () => {
  it('builds env vars correctly from context', () => {
    const ctx: F5XCContext = {
      name: 'staging',
      apiUrl: 'https://acme.console.ves.volterra.io/api',
      apiToken: 'tok-abc-123',
      defaultNamespace: 'web-ns',
    };

    const env = buildTerminalEnv(ctx);

    expect(env.F5XC_API_URL).toBe('https://acme.console.ves.volterra.io/api');
    expect(env.F5XC_API_TOKEN).toBe('tok-abc-123');
    expect(env.F5XC_NAMESPACE).toBe('web-ns');
    expect(env.F5XC_TENANT).toBe('acme');
    expect(env.F5XC_CONTEXT_NAME).toBe('staging');
  });

  it('handles dotless hostname (tenant undefined)', () => {
    const ctx: F5XCContext = {
      name: 'local',
      apiUrl: 'https://localhost/api',
      apiToken: 'tok-local',
      defaultNamespace: 'default',
    };

    const env = buildTerminalEnv(ctx);

    expect(env.F5XC_API_URL).toBe('https://localhost/api');
    expect(env.F5XC_TENANT).toBeUndefined();
    expect(env.F5XC_CONTEXT_NAME).toBe('local');
  });

  it('includes all expected keys for valid context', () => {
    const ctx: F5XCContext = {
      name: 'prod',
      apiUrl: 'https://tenant1.console.ves.volterra.io/api',
      apiToken: 'tok-prod',
      defaultNamespace: 'production',
    };

    const env = buildTerminalEnv(ctx);

    expect(Object.keys(env)).toEqual(
      expect.arrayContaining(['F5XC_API_URL', 'F5XC_API_TOKEN', 'F5XC_NAMESPACE', 'F5XC_TENANT', 'F5XC_CONTEXT_NAME']),
    );
  });
});
