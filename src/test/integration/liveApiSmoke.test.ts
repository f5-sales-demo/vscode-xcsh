// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Live API smoke tests for F5 Distributed Cloud.
 *
 * These tests make real HTTPS requests to the staging API.
 * They require:
 *   F5XC_API_URL  — e.g. https://tenant.console.ves.volterra.io
 *   F5XC_API_TOKEN — a valid API token
 *
 * When the env vars are absent the file is excluded via jest.config.js
 * testMatch gating, so the suite is never discovered.
 */

import * as https from 'node:https';
import * as url from 'node:url';

const API_URL = process.env.F5XC_API_URL ?? '';
const API_TOKEN = process.env.F5XC_API_TOKEN ?? '';

/**
 * Minimal HTTPS GET/POST helper — returns { statusCode, body }.
 */
function apiRequest(
  path: string,
  options: { token?: string; method?: string } = {},
): Promise<{ statusCode: number; body: string }> {
  const token = options.token ?? API_TOKEN;
  const method = options.method ?? 'GET';

  return new Promise((resolve, reject) => {
    const parsed = new url.URL(path, API_URL);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          Authorization: `APIToken ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 14000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: data });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.end();
  });
}

describe('Live API smoke tests', () => {
  // -----------------------------------------------------------------------
  // Env-var guards
  // -----------------------------------------------------------------------
  it('F5XC_API_URL is set', () => {
    expect(API_URL.length).toBeGreaterThan(0);
  }, 15000);

  it('F5XC_API_TOKEN is set', () => {
    expect(API_TOKEN.length).toBeGreaterThan(0);
  }, 15000);

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  it('GET /api/web/namespaces returns 200 (auth succeeds)', async () => {
    const res = await apiRequest('/api/web/namespaces');
    expect(res.statusCode).toBe(200);
  }, 15000);

  it('invalid token returns 401', async () => {
    const res = await apiRequest('/api/web/namespaces', {
      token: 'INVALID_TOKEN_000',
    });
    expect(res.statusCode).toBe(401);
  }, 15000);

  // -----------------------------------------------------------------------
  // Namespace discovery
  // -----------------------------------------------------------------------
  it('namespaces response has items array', async () => {
    const res = await apiRequest('/api/web/namespaces');
    const json = JSON.parse(res.body);
    expect(Array.isArray(json.items)).toBe(true);
  }, 15000);

  it('"system" and "shared" namespaces exist', async () => {
    const res = await apiRequest('/api/web/namespaces');
    const json = JSON.parse(res.body);
    const names: string[] = (json.items ?? []).map((item: { name?: string }) => item.name);
    expect(names).toContain('system');
    expect(names).toContain('shared');
  }, 15000);

  // -----------------------------------------------------------------------
  // Resource listing smoke checks
  // -----------------------------------------------------------------------
  it('list http_loadbalancers in default namespace returns 200 or 403', async () => {
    const res = await apiRequest('/api/config/namespaces/default/http_loadbalancers');
    expect([200, 403]).toContain(res.statusCode);
  }, 15000);

  it('list origin_pools in default namespace returns 200 or 403', async () => {
    const res = await apiRequest('/api/config/namespaces/default/origin_pools');
    expect([200, 403]).toContain(res.statusCode);
  }, 15000);

  it('system namespace path is reachable for app_firewalls (200/403/404, NOT 500)', async () => {
    const res = await apiRequest('/api/config/namespaces/system/app_firewalls');
    // Any non-500 code is acceptable — the endpoint exists and responds
    expect([200, 403, 404]).toContain(res.statusCode);
  }, 15000);
});
