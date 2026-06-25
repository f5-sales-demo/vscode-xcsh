// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { XCShContext } from '../../config/contextTypes';
import { buildTerminalEnv } from '../../xcsh/terminalIntegration';

describe('buildTerminalEnv', () => {
  it('builds env vars correctly from context', () => {
    const ctx: XCShContext = {
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
    const ctx: XCShContext = {
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
    const ctx: XCShContext = {
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
});
