// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Guard test: every curated namespace resource must resolve to a real API list path.
 *
 * The Resources tree is built from RESOURCE_TYPE_OVERRIDES (resourceTypes.ts), each matched to a
 * generated entry BY KEY. When an override key has no generated backing it silently falls back to
 * `/api/config/namespaces/{ns}/{key}s`, which 404s ("API Group could not be determined"). This test
 * fails on any such orphaned override so the class of bug cannot return.
 *
 * Platform / tenant-level resources (tenantLevel: true) and resources with an explicit customListPath
 * are exempt — they intentionally do not follow the `/api/{base}/namespaces/{ns}/{plural}` shape.
 */

import { RESOURCE_TYPES } from '../../api/resourceTypes';
import { GENERATED_RESOURCE_TYPES } from '../../generated/resourceTypesBase';

const NS = 'NS';

function listPath(info: { apiBase?: string; serviceSegment?: string; apiPath: string }): string {
  const base = info.apiBase ?? 'config';
  const seg = info.serviceSegment ? `/${info.serviceSegment}` : '';
  return `/api/${base}${seg}/namespaces/${NS}/${info.apiPath}`;
}

describe('resource override resolution (guard against orphaned overrides)', () => {
  const generatedKeys = new Set(Object.keys(GENERATED_RESOURCE_TYPES));
  const realListPaths = new Set(Object.values(GENERATED_RESOURCE_TYPES).map((g) => listPath(g)));

  it('every namespace resource override resolves to a real generated/spec list path', () => {
    const broken: string[] = [];

    for (const [key, info] of Object.entries(RESOURCE_TYPES)) {
      // Exemptions: tenant-level/platform resources and explicit custom paths.
      if (info.tenantLevel) {
        continue;
      }
      if (info.customListPath) {
        continue;
      }
      // Backed directly by a generated resource (path metadata flows from the spec).
      if (generatedKeys.has(key)) {
        continue;
      }
      // Otherwise the override must supply an explicit apiBase/apiPath that matches a real path.
      if (realListPaths.has(listPath(info))) {
        continue;
      }
      broken.push(`${key} -> ${listPath(info)}`);
    }

    expect(broken).toEqual([]);
  });
});
