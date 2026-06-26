// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Add-on capability catalog.
 *
 * Maps an F5 XC add-on service to the resource types it unlocks, derived from the resource
 * schema knowledge in RESOURCE_TYPES. Used by the Subscription → Plan dashboard to show, per
 * add-on, what it enables in the namespace tree, which API base/service-segment it serves, and
 * where it is hosted.
 *
 * Design constraints (so this can't drift or fabricate):
 *  - `resourceKeys` are validated against RESOURCE_TYPES at runtime; unknown keys are dropped.
 *  - `apiBases` are DERIVED from those resources' apiBase/serviceSegment — never hand-typed.
 *  - `cloud` is set only where F5 documents/states the hosting (extend as more is confirmed);
 *    it is intentionally absent for add-ons whose hosting we cannot assert.
 */

import { RESOURCE_TYPES } from './resourceTypes';

export interface AddonResource {
  key: string;
  displayName: string;
}

export interface AddonSchemaInfo {
  /** Resource types this add-on unlocks (only those present in the registry). */
  resources: AddonResource[];
  /** Distinct API base(s) the add-on serves, e.g. "/api/shape/bot", derived from the resources. */
  apiBases: string[];
  /** Public-cloud hosting, where authoritatively known (e.g. "AWS", "AWS, GCP"). */
  cloud?: string;
}

interface AddonRule {
  /** Matched (case-insensitive) against the add-on's `name` + `displayName`. */
  match: RegExp;
  resourceKeys: string[];
  cloud?: string;
}

/**
 * Curated add-on → capability rules. Ordered; the first match wins.
 */
const ADDON_RULES: AddonRule[] = [
  {
    match: /\bdns\b/i,
    resourceKeys: ['dns_zone', 'dns_domain', 'dns_load_balancer', 'dns_lb_pool', 'dns_lb_health_check'],
    cloud: 'AWS',
  },
  {
    match: /bot.?defense/i,
    resourceKeys: [
      'bot_allowlist_policy',
      'bot_endpoint_policy',
      'bot_network_policy',
      'bot_detection_rule',
      'protected_application',
    ],
    cloud: 'AWS, GCP',
  },
  {
    match: /client.?side|\bcsd\b/i,
    resourceKeys: ['protected_domain', 'allowed_domain', 'mitigated_domain'],
  },
  {
    match: /synthetic/i,
    resourceKeys: ['v1_dns_monitor', 'v1_http_monitor'],
  },
  {
    match: /nginx/i,
    resourceKeys: ['nginx_instance', 'nginx_server', 'nginx_csg', 'nginx_service_discovery'],
  },
  {
    match: /web app.*api|waap|api protection/i,
    resourceKeys: [
      'http_loadbalancer',
      'app_firewall',
      'api_crawler',
      'api_discovery',
      'api_testing',
      'service_policy',
    ],
  },
  {
    match: /scanning/i,
    resourceKeys: ['api_crawler', 'api_discovery'],
  },
  {
    match: /content delivery|\bcdn\b/i,
    resourceKeys: ['cdn_loadbalancer'],
  },
  {
    match: /irule/i,
    resourceKeys: ['bigip_irule'],
  },
  {
    match: /routed ddos|\bddos\b|infraprotect/i,
    resourceKeys: [
      'infraprotect_asn',
      'infraprotect_firewall_rule',
      'infraprotect_firewall_ruleset',
      'infraprotect_deny_list_rule',
    ],
  },
];

/**
 * Resolve the capability info for an add-on service.
 * Returns empty resources/apiBases (and no cloud) when the add-on has no mapped resources.
 */
export function getAddonSchemaInfo(addon: { name: string; displayName: string }): AddonSchemaInfo {
  const haystack = `${addon.name} ${addon.displayName}`;
  const rule = ADDON_RULES.find((r) => r.match.test(haystack));
  if (!rule) {
    return { resources: [], apiBases: [] };
  }

  const resources: AddonResource[] = [];
  const bases = new Set<string>();
  for (const key of rule.resourceKeys) {
    const info = RESOURCE_TYPES[key];
    if (!info) {
      continue; // resource not in the registry — drop it rather than show a non-existent capability
    }
    resources.push({ key, displayName: info.displayName });
    bases.add(`/api/${info.apiBase ?? 'config'}${info.serviceSegment ? `/${info.serviceSegment}` : ''}`);
  }

  return { resources, apiBases: [...bases].sort(), cloud: rule.cloud };
}
