// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * No-silent-drops guard for resource coverage (issue #727).
 *
 * Asserts that the set of namespace-map-classified resources NOT surfaced in the
 * curated RESOURCE_TYPES tree matches a committed snapshot. When upstream drift
 * changes that set, this test fails and forces a conscious decision (surface the
 * resource via an override, or acknowledge it in the snapshot) — nothing appears
 * or disappears from the tree silently.
 */

import { KNOWN_INVISIBLE_MAP_RESOURCES, KNOWN_PARSE_GAP_RESOURCES } from '../../api/resourceCoverage';
import { RESOURCE_TYPES } from '../../api/resourceTypes';
import { NAMESPACE_PROFILES_MAP } from '../../generated/namespaceProfiles';
import { GENERATED_RESOURCE_TYPES } from '../../generated/resourceTypesBase';

function mapKeys(): string[] {
  return Object.keys(NAMESPACE_PROFILES_MAP.resources);
}

describe('Resource coverage guard (#727)', () => {
  it('map-classified resources not visible in RESOURCE_TYPES match the committed snapshot', () => {
    const visible = new Set(Object.keys(RESOURCE_TYPES));
    const invisible = mapKeys()
      .filter((k) => !visible.has(k))
      .sort();
    // If this fails: a map resource newly appeared/disappeared from the tree.
    // Decide per resource — add a RESOURCE_TYPE_OVERRIDES entry to surface it, or
    // update KNOWN_INVISIBLE_MAP_RESOURCES (via scripts/update-resource-coverage.ts).
    expect(invisible).toEqual([...KNOWN_INVISIBLE_MAP_RESOURCES]);
  });

  it('map resources with no generated type (parse gap) match the committed snapshot', () => {
    const generated = new Set(Object.keys(GENERATED_RESOURCE_TYPES));
    const parseGap = mapKeys()
      .filter((k) => !generated.has(k))
      .sort();
    expect(parseGap).toEqual([...KNOWN_PARSE_GAP_RESOURCES]);
  });

  it('a surfaced parse-gap resource must supply its own apiPath (no generated one exists)', () => {
    // A parse-gap resource (no generated type) can still be surfaced via a manual
    // override — but only if that override provides an apiPath/customListPath,
    // otherwise the tree item cannot resolve an endpoint. `user` is the canonical
    // example. This guards against surfacing an unusable parse-gap resource.
    const generated = new Set(Object.keys(GENERATED_RESOURCE_TYPES));
    const surfacedParseGap = Object.entries(RESOURCE_TYPES).filter(([key]) => !generated.has(key));
    const missingEndpoint = surfacedParseGap
      .filter(([, info]) => !info.apiPath && !info.customListPath)
      .map(([key]) => key);
    expect(missingEndpoint).toEqual([]);
  });

  it('no snapshot entry is stale (every listed key is still classified in the map)', () => {
    const classified = new Set(mapKeys());
    const stale = [...KNOWN_INVISIBLE_MAP_RESOURCES, ...KNOWN_PARSE_GAP_RESOURCES].filter((k) => !classified.has(k));
    expect(stale).toEqual([]);
  });
});
