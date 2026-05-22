// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Live CRUD integration tests for F5 Distributed Cloud.
 *
 * These tests exercise the full create/read/update/delete lifecycle
 * against the real F5 XC API using F5XCClient directly.
 *
 * Required env vars:
 *   F5XC_API_URL  — e.g. https://tenant.console.ves.volterra.io
 *   F5XC_API_TOKEN — a valid API token
 *
 * When the env vars are absent the file is excluded via jest.config.js
 * testMatch gating, so the suite is never discovered.
 */

import { TokenAuthProvider } from '../../api/auth/tokenAuth';
import { F5XCClient, type Resource } from '../../api/client';
import { F5XCApiError } from '../../utils/errors';

const API_URL = process.env.F5XC_API_URL ?? '';
const API_TOKEN = process.env.F5XC_API_TOKEN ?? '';
const NAMESPACE = 'default';
const PREFIX = `test-sp3-${Date.now()}`;

// Track created resources for cleanup
const createdResources: Array<{ apiPath: string; name: string }> = [];

let client: F5XCClient;

beforeAll(() => {
  const auth = new TokenAuthProvider({ apiUrl: API_URL, apiToken: API_TOKEN });
  client = new F5XCClient(API_URL, auth);
});

afterAll(async () => {
  // Best-effort cleanup of all resources created during tests
  for (const resource of createdResources) {
    try {
      await client.delete(NAMESPACE, resource.apiPath, resource.name);
    } catch {
      // Ignore cleanup errors — resource may already be deleted
    }
  }
}, 60000);

// ---------------------------------------------------------------------------
// Healthcheck lifecycle
// ---------------------------------------------------------------------------
describe('Healthcheck CRUD lifecycle', () => {
  const apiPath = 'healthchecks';
  const hcName = `${PREFIX}-hc`;

  it('create healthcheck', async () => {
    const body = {
      metadata: { name: hcName, namespace: NAMESPACE },
      spec: {
        http_health_check: {
          use_origin_server_name: {},
          path: '/health',
        },
        healthy_threshold: 3,
        interval: 15,
        timeout: 10,
        unhealthy_threshold: 1,
      },
    } as unknown as Resource;

    const result = await client.create(NAMESPACE, apiPath, body);
    createdResources.push({ apiPath, name: hcName });
    expect(result).toBeDefined();
  }, 30000);

  it('get healthcheck — verify name', async () => {
    const result = await client.get(NAMESPACE, apiPath, hcName);
    expect(result.metadata.name).toBe(hcName);
  }, 30000);

  it('list healthchecks — verify present', async () => {
    const items = await client.list(NAMESPACE, apiPath);
    // Some items may have name at root level or under metadata
    const names = items.map((item) => {
      const asRecord = item as unknown as Record<string, unknown>;
      return asRecord.name || item.metadata?.name;
    });
    expect(names).toContain(hcName);
  }, 30000);

  it('replace healthcheck — change interval to 30', async () => {
    const body = {
      metadata: { name: hcName, namespace: NAMESPACE },
      spec: {
        http_health_check: {
          use_origin_server_name: {},
          path: '/health',
        },
        healthy_threshold: 3,
        interval: 30,
        timeout: 10,
        unhealthy_threshold: 1,
      },
    } as unknown as Resource;

    const result = await client.replace(NAMESPACE, apiPath, hcName, body);
    expect(result).toBeDefined();
  }, 30000);

  it('get healthcheck — verify interval changed', async () => {
    const result = await client.get<Resource<{ interval?: number }>>(NAMESPACE, apiPath, hcName);
    expect(result.spec.interval).toBe(30);
  }, 30000);

  it('delete healthcheck', async () => {
    await client.delete(NAMESPACE, apiPath, hcName);
    // Remove from cleanup list since it's already deleted
    const idx = createdResources.findIndex((r) => r.apiPath === apiPath && r.name === hcName);
    if (idx >= 0) {
      createdResources.splice(idx, 1);
    }
  }, 30000);

  it('get deleted healthcheck — expect F5XCApiError with isNotFound', async () => {
    try {
      await client.get(NAMESPACE, apiPath, hcName);
      // Should not reach here
      fail('Expected F5XCApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(F5XCApiError);
      expect((error as F5XCApiError).isNotFound).toBe(true);
    }
  }, 30000);
});

// ---------------------------------------------------------------------------
// Origin pool lifecycle
// ---------------------------------------------------------------------------
describe('Origin pool CRUD lifecycle', () => {
  const apiPath = 'origin_pools';
  const opName = `${PREFIX}-op`;

  it('create origin pool', async () => {
    const body = {
      metadata: { name: opName, namespace: NAMESPACE },
      spec: {
        origin_servers: [
          {
            public_name: { dns_name: 'example.com' },
          },
        ],
        port: 443,
        use_tls: {
          use_host_header_as_sni: {},
          tls_config: { default_security: {} },
          skip_server_verification: {},
        },
        loadbalancer_algorithm: 'LB_OVERRIDE',
        endpoint_selection: 'LOCAL_PREFERRED',
        healthcheck: [],
      },
    } as unknown as Resource;

    const result = await client.create(NAMESPACE, apiPath, body);
    createdResources.push({ apiPath, name: opName });
    expect(result).toBeDefined();
  }, 30000);

  it('get origin pool — verify name', async () => {
    const result = await client.get(NAMESPACE, apiPath, opName);
    expect(result.metadata.name).toBe(opName);
  }, 30000);

  it('delete origin pool', async () => {
    await client.delete(NAMESPACE, apiPath, opName);
    const idx = createdResources.findIndex((r) => r.apiPath === apiPath && r.name === opName);
    if (idx >= 0) {
      createdResources.splice(idx, 1);
    }
  }, 30000);
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('Error handling', () => {
  it('get nonexistent resource — F5XCApiError with isNotFound', async () => {
    try {
      await client.get(NAMESPACE, 'healthchecks', `${PREFIX}-does-not-exist`);
      fail('Expected F5XCApiError to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(F5XCApiError);
      expect((error as F5XCApiError).isNotFound).toBe(true);
    }
  }, 30000);

  it('create duplicate resource — statusCode 4xx', async () => {
    const apiPath = 'healthchecks';
    const dupName = `${PREFIX}-dup`;
    const body = {
      metadata: { name: dupName, namespace: NAMESPACE },
      spec: {
        http_health_check: {
          use_origin_server_name: {},
          path: '/health',
        },
        healthy_threshold: 3,
        interval: 15,
        timeout: 10,
        unhealthy_threshold: 1,
      },
    } as unknown as Resource;

    // Create the first one
    await client.create(NAMESPACE, apiPath, body);
    createdResources.push({ apiPath, name: dupName });

    // Attempt to create a duplicate
    try {
      await client.create(NAMESPACE, apiPath, body);
      fail('Expected F5XCApiError to be thrown for duplicate creation');
    } catch (error) {
      expect(error).toBeInstanceOf(F5XCApiError);
      const apiError = error as F5XCApiError;
      expect(apiError.statusCode).toBeGreaterThanOrEqual(400);
      expect(apiError.statusCode).toBeLessThan(500);
    }
  }, 30000);
});
