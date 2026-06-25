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
 *  - the add-on catalog + activation status that AddonsGroupNode renders (read-only);
 *  - OPTIONAL add-on subscribe→unsubscribe, gated behind XCSH_TEST_ADDON (mutates tenant state).
 *
 * Required env vars (suite is excluded by jest.config.js when XCSH_API_URL is absent):
 *   XCSH_API_URL        — e.g. https://tenant.console.ves.volterra.io
 *   XCSH_API_TOKEN      — a valid API token
 *   XCSH_TEST_NAMESPACE — namespace to list resources in (default: "default")
 *   XCSH_TEST_ADDON     — (optional) addon service name to subscribe/unsubscribe (MUTATING)
 */

import { TokenAuthProvider } from '../../api/auth/tokenAuth';
import { XCSHClient } from '../../api/client';
import { getCategorizedResourceTypesForNamespace, RESOURCE_TYPES } from '../../api/resourceTypes';
import {
  createAddonSubscription,
  deleteAddonSubscription,
  getAddonActivationStatus,
  getCurrentPlan,
} from '../../api/subscription';
import { XCSHApiError } from '../../utils/errors';

const API_URL = process.env.XCSH_API_URL ?? '';
const API_TOKEN = process.env.XCSH_API_TOKEN ?? '';
const NS = process.env.XCSH_TEST_NAMESPACE ?? 'default';
const MUTATE_ADDON = process.env.XCSH_TEST_ADDON;

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

describe('Live: Platform & Add-ons (read-only)', () => {
  it('loads the add-on catalog via getCurrentPlan (what AddonsGroupNode lists)', async () => {
    const plan = await getCurrentPlan(client);
    expect(plan).toBeDefined();
    expect(Array.isArray(plan.allowedAddonServices)).toBe(true);
    expect(Array.isArray(plan.includedAddonServices)).toBe(true);
  }, 30000);

  it('reads activation status for each add-on without throwing', async () => {
    const plan = await getCurrentPlan(client);
    const addons = [...plan.includedAddonServices, ...plan.allowedAddonServices];
    const valid = ['AS_NONE', 'AS_PENDING', 'AS_SUBSCRIBED', 'AS_ERROR'];
    for (const addon of addons) {
      const status = await getAddonActivationStatus(client, addon.name);
      expect(valid).toContain(status.state);
    }
  }, 120000);
});

// Gated, MUTATING: subscribe then unsubscribe a specific add-on. Only runs when XCSH_TEST_ADDON is set.
(MUTATE_ADDON ? describe : describe.skip)('Live: add-on subscribe/unsubscribe (MUTATING)', () => {
  it('subscribes then unsubscribes the add-on', async () => {
    const addon = MUTATE_ADDON as string;
    const sub = await createAddonSubscription(client, addon, 'system');
    expect(sub.metadata?.name).toBeDefined();

    const status = await getAddonActivationStatus(client, addon);
    expect(['AS_PENDING', 'AS_SUBSCRIBED']).toContain(status.state);

    await deleteAddonSubscription(client, addon, 'system');
  }, 120000);
});
