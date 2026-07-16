// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Live smoke test (UAT) for the quota display data layer.
 *
 * Drives the REAL getQuotaUsage() against a live F5 XC tenant and asserts the parsed
 * structure matches the current /quota/usage schema (objects/resources/apis maps):
 *  - object/resource items have finite numeric usage + a positive limit;
 *  - percentUsed is a finite number and overLimit is consistent with usage>limit;
 *  - api items carry a numeric rate.
 * It logs any over-limit rows and the ≥80% (critical) count so the tenant's real numbers
 * can be eyeballed against the dashboard.
 *
 * Required env vars (suite is excluded by jest.config.js when XCSH_API_URL is absent):
 *   XCSH_API_URL   — e.g. https://tenant.console.ves.volterra.io
 *   XCSH_API_TOKEN — a valid API token
 */

import { TokenAuthProvider } from '../../api/auth/tokenAuth';
import { XCSHClient } from '../../api/client';
import { getQuotaUsage } from '../../api/subscription';

const API_URL = process.env.XCSH_API_URL ?? '';
const API_TOKEN = process.env.XCSH_API_TOKEN ?? '';

let client: XCSHClient;

beforeAll(() => {
  client = new XCSHClient(API_URL, new TokenAuthProvider({ apiUrl: API_URL, apiToken: API_TOKEN }));
});

describe('Live: quota/usage parsing', () => {
  it('parses objects/resources/apis with valid, consistent values', async () => {
    const usage = await getQuotaUsage(client, 'system');

    // At least the object-count quotas should be present on any tenant.
    expect(usage.objects.length).toBeGreaterThan(0);

    for (const item of [...usage.objects, ...usage.resources]) {
      expect(Number.isFinite(item.usage)).toBe(true);
      expect(Number.isFinite(item.limit)).toBe(true);
      expect(item.limit).toBeGreaterThan(0); // unlimited (-1) / zero are filtered out
      expect(Number.isFinite(item.percentUsed)).toBe(true);
      expect(item.overLimit).toBe(item.usage > item.limit);
    }

    for (const api of usage.apis) {
      expect(Number.isFinite(api.rate)).toBe(true);
    }

    const critical = [...usage.objects, ...usage.resources].filter((i) => i.percentUsed >= 80);
    const overLimit = [...usage.objects, ...usage.resources].filter((i) => i.overLimit);
    // Surface the real numbers for manual verification against the panel.
    console.log(
      `[quota live] objects=${usage.objects.length} resources=${usage.resources.length} ` +
        `apis=${usage.apis.length} critical(>=80%)=${critical.length}`,
    );
    console.log(
      `[quota live] over-limit rows: ${
        overLimit.map((i) => `${i.key} ${i.usage}/${i.limit} (${i.percentUsed}%)`).join(', ') || 'none'
      }`,
    );
  }, 30000);
});
