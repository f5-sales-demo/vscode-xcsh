// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/** Contract assertions replacing the historical invisible/parse-gap snapshots. */

import * as path from 'node:path';
import { loadResourceCoverage } from '../../../scripts/generators/spec-parser';
import { RESOURCE_TYPES } from '../../api/resourceTypes';
import { NAMESPACE_PROFILES_MAP } from '../../generated/namespaceProfiles';
import { GENERATED_RESOURCE_TYPES } from '../../generated/resourceTypesBase';

const COVERAGE_PATH = path.resolve(__dirname, '../../../docs/specifications/api/domains/resource_coverage.json');

describe('Resource coverage contract (#1105)', () => {
  const coverage = loadResourceCoverage(COVERAGE_PATH, NAMESPACE_PROFILES_MAP.version);

  it('classifies every explicit namespace profile exactly once', () => {
    expect(Object.keys(coverage.resources).sort()).toEqual(Object.keys(NAMESPACE_PROFILES_MAP.resources).sort());
  });

  it('generates exactly the resources with generated disposition', () => {
    const expected = Object.entries(coverage.resources)
      .filter(([, record]) => record.disposition === 'generated')
      .map(([resourceKey]) => resourceKey)
      .sort();
    expect(Object.keys(GENERATED_RESOURCE_TYPES).sort()).toEqual(expected);
  });

  it('requires every manual resource to have a matching valid override path', () => {
    const failures = Object.entries(coverage.resources).flatMap(([resourceKey, record]) =>
      record.disposition === 'manual' && RESOURCE_TYPES[resourceKey]?.customListPath !== record.path
        ? [resourceKey]
        : [],
    );
    expect(failures).toEqual([]);
  });

  it('does not generate or surface excluded resources', () => {
    const excluded = Object.entries(coverage.resources)
      .filter(([, record]) => record.disposition === 'excluded')
      .map(([resourceKey]) => resourceKey);
    const leaked = excluded.filter(
      (resourceKey) => GENERATED_RESOURCE_TYPES[resourceKey] || RESOURCE_TYPES[resourceKey],
    );
    expect(leaked).toEqual([]);
  });
});
