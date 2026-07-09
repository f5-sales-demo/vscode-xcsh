// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Idempotent updater for the resource-coverage snapshots (issue #727).
 *
 * Recomputes the map-classified-but-invisible and parse-gap sets from the live
 * runtime registry + generated artifacts and rewrites src/api/resourceCoverage.ts.
 * Run this ONLY after an intentional coverage change (surfacing a resource, or an
 * upstream reclassification) — the guard test then passes again.
 *
 * Usage: npx ts-node scripts/update-resource-coverage.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RESOURCE_TYPES } from '../src/api/resourceTypes';
import { NAMESPACE_PROFILES_MAP } from '../src/generated/namespaceProfiles';
import { GENERATED_RESOURCE_TYPES } from '../src/generated/resourceTypesBase';

const OUTPUT = path.join(__dirname, '..', 'src', 'api', 'resourceCoverage.ts');

function computeSets(): { invisible: string[]; parseGap: string[] } {
  const mapKeys = Object.keys(NAMESPACE_PROFILES_MAP.resources);
  const visible = new Set(Object.keys(RESOURCE_TYPES));
  const generated = new Set(Object.keys(GENERATED_RESOURCE_TYPES));
  const invisible = mapKeys.filter((k) => !visible.has(k)).sort();
  const parseGap = mapKeys.filter((k) => !generated.has(k)).sort();
  return { invisible, parseGap };
}

function toArrayLiteral(keys: string[]): string {
  if (keys.length === 0) {
    return '[]';
  }
  return `[\n${keys.map((k) => `  '${k}',`).join('\n')}\n]`;
}

function render(invisible: string[], parseGap: string[]): string {
  return `// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Resource coverage snapshots (issue #727).
 *
 * The extension surfaces a *curated* subset of resource types: only keys present
 * in RESOURCE_TYPE_OVERRIDES (which carry hand-authored UI metadata such as an
 * icon) appear in RESOURCE_TYPES. Resources classified in the authoritative
 * namespace map but not surfaced were previously dropped **silently**.
 *
 * These snapshots make the gap explicit so it can never drift silently. The
 * guard test in \`resourceCoverage.test.ts\` asserts the live gap equals the
 * snapshot; when upstream adds/renames/removes a resource, the test fails and a
 * human must make a conscious decision:
 *   - surface it: add an entry to RESOURCE_TYPE_OVERRIDES (with UI metadata), or
 *   - acknowledge it: refresh the snapshots below.
 *
 * DO NOT edit the arrays by hand — regenerate with:
 *   npx ts-node scripts/update-resource-coverage.ts
 */

/**
 * Resources classified in the authoritative namespace map that are NOT visible
 * in the curated RESOURCE_TYPES tree. Sorted. This is the primary no-silent-drops
 * guard: the set must change only via a reviewed regeneration.
 */
export const KNOWN_INVISIBLE_MAP_RESOURCES: readonly string[] = ${toArrayLiteral(invisible)};

/**
 * Subset of the above: resources in the namespace map that the generator cannot
 * parse from the domain specs at all (no consumable resource type is produced).
 * These require an upstream spec/parser change before they could ever be
 * surfaced. Tracked separately so a growing parse gap is visible in CI.
 */
export const KNOWN_PARSE_GAP_RESOURCES: readonly string[] = ${toArrayLiteral(parseGap)};
`;
}

function main(): void {
  const { invisible, parseGap } = computeSets();
  fs.writeFileSync(OUTPUT, render(invisible, parseGap), 'utf-8');
  console.log(`Updated ${OUTPUT}: ${invisible.length} invisible (${parseGap.length} of them parse-gap).`);
}

main();
