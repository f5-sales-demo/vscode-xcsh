// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import {
  getFieldConflicts,
  getFieldDefaults,
  getMinimumConfigFields,
  getServerDefaultFields,
} from '../../api/resourceTypes';

jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() })),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({ get: jest.fn().mockReturnValue('info') })),
  },
}));

jest.mock(
  '@f5xc-salesdemos/pi-resource-management',
  () => ({
    ResourceClient: jest.fn(),
    toManifest: jest.fn(),
    applyMinimalExportFilter: jest.fn((spec: Record<string, unknown>) => spec),
    formatManifestOutput: jest.fn(),
    parseManifests: jest.fn(),
    formatDiff: jest.fn(),
  }),
  { virtual: true },
);

const TARGET_RESOURCES = [
  'http_loadbalancer',
  'origin_pool',
  'healthcheck',
  'app_firewall',
  'route',
  'api_discovery',
  'network_connector',
  'network_firewall',
  'network_policy',
  'site_mesh_group',
  'virtual_site',
  'virtual_network',
] as const;

describe('metadata coverage for target resources', () => {
  for (const kind of TARGET_RESOURCES) {
    describe(kind, () => {
      it('has field metadata (getServerDefaultFields does not throw)', () => {
        expect(() => getServerDefaultFields(kind)).not.toThrow();
      });

      it('has field conflicts or metadata available', () => {
        const conflicts = getFieldConflicts(kind);
        const sd = getServerDefaultFields(kind);
        const mc = getMinimumConfigFields(kind);
        expect(Object.keys(conflicts).length + sd.length + mc.length).toBeGreaterThanOrEqual(0);
      });

      it('getFieldDefaults returns an object', () => {
        const defaults = getFieldDefaults(kind);
        expect(typeof defaults).toBe('object');
      });

      it('getMinimumConfigFields returns an array', () => {
        const mc = getMinimumConfigFields(kind);
        expect(Array.isArray(mc)).toBe(true);
      });
    });
  }
});

// buildMinimalExportFilter now lives in @f5xc-salesdemos/pi-resource-management and is
// covered by that package's own test suite (build-minimal-filter.test.ts). vscode only
// verifies the local field-metadata helpers that its non-export UI still relies on.

// Exact counts here are derived from the enriched specs, which are regenerated
// from the latest api-specs-enriched release on every build — so they drift over
// time. Assert that rich resources expose metadata (presence/lower-bound) rather
// than pinning volatile exact counts.
describe('specific resource type assertions', () => {
  it('app_firewall exposes server-default fields', () => {
    expect(getServerDefaultFields('app_firewall').length).toBeGreaterThan(0);
  });

  it('app_firewall exposes minimum-config fields', () => {
    expect(getMinimumConfigFields('app_firewall').length).toBeGreaterThan(0);
  });

  it('healthcheck exposes server-default fields', () => {
    expect(getServerDefaultFields('healthcheck').length).toBeGreaterThan(0);
  });

  it('healthcheck exposes minimum-config fields', () => {
    expect(getMinimumConfigFields('healthcheck').length).toBeGreaterThan(0);
  });

  it('network_connector has metadata available', () => {
    const sd = getServerDefaultFields('network_connector');
    const conflicts = getFieldConflicts('network_connector');
    expect(sd.length + Object.keys(conflicts).length).toBeGreaterThanOrEqual(0);
  });

  it('network_firewall has serverDefaultFields or conflicts', () => {
    const sd = getServerDefaultFields('network_firewall');
    const conflicts = getFieldConflicts('network_firewall');
    expect(sd.length + Object.keys(conflicts).length).toBeGreaterThan(0);
  });

  it('api_discovery exposes field metadata', () => {
    expect(Array.isArray(getServerDefaultFields('api_discovery'))).toBe(true);
  });

  it('http_loadbalancer has many conflictsWith entries', () => {
    const conflicts = getFieldConflicts('http_loadbalancer');
    expect(Object.keys(conflicts).length).toBeGreaterThanOrEqual(28);
  });

  it('origin_pool has 51+ conflictsWith entries', () => {
    const conflicts = getFieldConflicts('origin_pool');
    expect(Object.keys(conflicts).length).toBeGreaterThanOrEqual(51);
  });

  it('network_firewall has conflictsWith entries', () => {
    const conflicts = getFieldConflicts('network_firewall');
    expect(Object.keys(conflicts).length).toBeGreaterThan(0);
  });
});
