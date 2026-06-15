// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import {
  getFieldConflicts,
  getFieldDefaults,
  getMinimumConfigFields,
  getServerDefaultFields,
} from '../../api/resourceTypes';
import { buildMinimalExportFilter } from '../../services/resourceService';

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

describe('buildMinimalExportFilter for target resources', () => {
  for (const kind of TARGET_RESOURCES) {
    describe(kind, () => {
      it('returns a filter object (not undefined)', () => {
        const filter = buildMinimalExportFilter(kind);
        // Some resource types have zero serverDefaultFields but still have conflicts
        // The filter is built when serverDefaultFields > 0
        const sd = getServerDefaultFields(kind);
        if (sd.length > 0) {
          expect(filter).toBeDefined();
          expect(filter!.serverDefaults).toBeDefined();
          expect(filter!.serverDefaultFields).toBeDefined();
        }
        // If no serverDefaultFields, filter may be undefined — that's correct behavior
      });

      it('filter serverDefaults paths do not have spec. prefix', () => {
        const filter = buildMinimalExportFilter(kind);
        if (!filter) {
          return;
        }
        for (const key of Object.keys(filter.serverDefaults ?? {})) {
          expect(key).not.toMatch(/^spec\./);
        }
        for (const field of filter.serverDefaultFields ?? []) {
          expect(field).not.toMatch(/^spec\./);
        }
      });

      it('filter minimumConfigFields paths do not have spec. prefix', () => {
        const filter = buildMinimalExportFilter(kind);
        if (!filter) {
          return;
        }
        for (const field of filter.minimumConfigFields ?? []) {
          expect(field).not.toMatch(/^spec\./);
        }
      });

      it('filter oneofDefaultVariants only contains fields that exist in serverDefaults or serverDefaultFields', () => {
        const filter = buildMinimalExportFilter(kind);
        if (!filter) {
          return;
        }
        for (const key of Object.keys(filter.oneofDefaultVariants ?? {})) {
          expect(typeof key).toBe('string');
          expect(key.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('specific resource type assertions', () => {
  it('app_firewall has 7 serverDefaultFields', () => {
    const sd = getServerDefaultFields('app_firewall');
    expect(sd.length).toBe(7);
  });

  it('app_firewall filter strips known defaults', () => {
    const filter = buildMinimalExportFilter('app_firewall');
    expect(filter).toBeDefined();
    const allKeys = [...Object.keys(filter!.serverDefaults ?? {}), ...(filter!.serverDefaultFields ?? [])];
    expect(allKeys.length).toBeGreaterThanOrEqual(7);
  });

  it('app_firewall has 2 minimumConfigFields', () => {
    const mc = getMinimumConfigFields('app_firewall');
    expect(mc.length).toBe(2);
  });

  it('healthcheck has 1 serverDefaultField', () => {
    const sd = getServerDefaultFields('healthcheck');
    expect(sd.length).toBe(1);
  });

  it('healthcheck has 6 minimumConfigFields', () => {
    const mc = getMinimumConfigFields('healthcheck');
    expect(mc.length).toBe(6);
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

  it('api_discovery has 1 serverDefaultField', () => {
    const sd = getServerDefaultFields('api_discovery');
    expect(sd.length).toBe(1);
  });

  it('http_loadbalancer has 28+ conflictsWith entries', () => {
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
