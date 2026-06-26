// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Live smoke test (UAT) for the resource-list-path fix and the Platform & Add-ons section.
 *
 * Drives the REAL extension code paths against a live F5 XC tenant:
 *  - lists each previously-broken resource type via the same RESOURCE_TYPES metadata +
 *    XCSHClient.buildListOptions the tree uses, asserting none returns the
 *    "API Group could not be determined" 404 that this change fixes;
 *  - a negative control proving the old /api/config/.../synthetic_monitors path still 404s;
 *  - a full sweep of every resource type available in the namespace (regression net);
 *  - the add-on catalog + activation status the Subscription → Plan dashboard reads (read-only).
 *
 * Required env vars (suite is excluded by jest.config.js when XCSH_API_URL is absent):
 *   XCSH_API_URL        — e.g. https://tenant.console.ves.volterra.io
 *   XCSH_API_TOKEN      — a valid API token
 *   XCSH_TEST_NAMESPACE — namespace to list resources in (default: "default")
 */

import { getAddonSchemaInfo } from '../../api/addonCatalog';
import { TokenAuthProvider } from '../../api/auth/tokenAuth';
import { XCSHClient } from '../../api/client';
import { getCategorizedResourceTypesForNamespace, RESOURCE_TYPES } from '../../api/resourceTypes';
import { getAddonActivationStatus, getCurrentPlan } from '../../api/subscription';
import { XCSHApiError } from '../../utils/errors';

const API_URL = process.env.XCSH_API_URL ?? '';
const API_TOKEN = process.env.XCSH_API_TOKEN ?? '';
const NS = process.env.XCSH_TEST_NAMESPACE ?? 'default';

let client: XCSHClient;

beforeAll(() => {
  client = new XCSHClient(API_URL, new TokenAuthProvider({ apiUrl: API_URL, apiToken: API_TOKEN }));
});

/** True if the error is the "API Group could not be determined" 404 that this change fixes. */
function isApiGroup404(e: unknown): boolean {
  if (e instanceof XCSHApiError) {
    return e.statusCode === 404 && /API Group could not be determined/i.test(e.message);
  }
  return /API Group could not be determined/i.test((e as Error)?.message ?? String(e));
}

// The previously-orphaned-now-fixed resource types (all namespace-scoped).
const FIXED_RESOURCES = [
  'v1_dns_monitor',
  'v1_http_monitor',
  'api_crawler',
  'api_discovery',
  'api_testing',
  'nginx_instance',
  'nginx_server',
  'nginx_csg',
  'nginx_service_discovery',
  'protected_domain',
  'allowed_domain',
  'mitigated_domain',
  'bot_allowlist_policy',
  'bot_endpoint_policy',
  'bot_network_policy',
  'bot_detection_rule',
  'lma_region',
];

describe('Live: resource list paths (404 fix)', () => {
  it.each(FIXED_RESOURCES)('lists "%s" without an API-Group 404', async (key) => {
    const info = RESOURCE_TYPES[key];
    expect(info).toBeDefined();
    if (!info) {
      return;
    }
    try {
      await client.listWithOptions(NS, info.apiPath, XCSHClient.buildListOptions(info));
      // A 2xx (possibly empty) is the success case.
    } catch (e) {
      // RBAC/permission (403) and other errors are tolerated here; the regression we guard
      // against is specifically the "API Group could not be determined" 404.
      if (isApiGroup404(e)) {
        throw new Error(
          `${key} still 404s: GET /api/${info.apiBase ?? 'config'}${info.serviceSegment ? `/${info.serviceSegment}` : ''}/namespaces/${NS}/${info.apiPath}`,
          { cause: e },
        );
      }
    }
  }, 30000);

  it('negative control: old /synthetic_monitors path still returns an API-Group 404', async () => {
    let threw = false;
    try {
      await client.customRequest(`/api/config/namespaces/${NS}/synthetic_monitors`);
    } catch (e) {
      threw = true;
      expect(isApiGroup404(e)).toBe(true);
    }
    expect(threw).toBe(true);
  }, 30000);

  it('regression net: no resource type available in the namespace returns an API-Group 404', async () => {
    const categorized = getCategorizedResourceTypesForNamespace(NS);
    const offenders: string[] = [];
    for (const [, types] of categorized) {
      for (const [key, info] of types) {
        try {
          await client.listWithOptions(NS, info.apiPath, XCSHClient.buildListOptions(info));
        } catch (e) {
          if (isApiGroup404(e)) {
            offenders.push(key);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 600000);
});

describe('Live: subscription add-on data (read-only)', () => {
  it('loads the add-on catalog via getCurrentPlan (the Plan dashboard data source)', async () => {
    const plan = await getCurrentPlan(client);
    expect(plan).toBeDefined();
    expect(Array.isArray(plan.allowedAddonServices)).toBe(true);
    expect(Array.isArray(plan.includedAddonServices)).toBe(true);
    // Included add-on services are the subscribed/active ones shown with a tier badge.
    expect(plan.includedAddonServices.length).toBeGreaterThan(0);
  }, 30000);

  it('activation-status endpoint responds with a valid state for each add-on', async () => {
    const plan = await getCurrentPlan(client);
    const addons = [...plan.includedAddonServices, ...plan.allowedAddonServices];
    const valid = ['AS_NONE', 'AS_PENDING', 'AS_SUBSCRIBED', 'AS_ERROR'];
    for (const addon of addons) {
      const status = await getAddonActivationStatus(client, addon.name);
      expect(valid).toContain(status.state);
    }
  }, 120000);

  it('dashboard augmentation maps the tenant add-ons to real resources/API/cloud (no fabrication)', async () => {
    const plan = await getCurrentPlan(client);
    const seen = new Set<string>();
    let mapped = 0;
    for (const addon of [...plan.includedAddonServices, ...plan.allowedAddonServices]) {
      if (seen.has(addon.name)) {
        continue;
      }
      seen.add(addon.name);
      const info = getAddonSchemaInfo(addon); // must not throw on any real add-on
      if (info.resources.length > 0) {
        mapped++;
        // Every mapped resource must be real (validated against the registry).
        for (const r of info.resources) {
          expect(r.displayName).toBeTruthy();
        }
      }

      console.log(
        `addon: ${addon.displayName.padEnd(30)} resources=${info.resources.length} api=${info.apiBases.join(',') || '-'} cloud=${info.cloud ?? '-'}`,
      );
    }
    // The staging tenant includes DNS / Bot Defense / Synthetic Monitoring / etc., so some map.
    expect(mapped).toBeGreaterThan(0);
  }, 60000);
});
