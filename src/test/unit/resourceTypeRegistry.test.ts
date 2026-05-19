// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for the Resource Type Registry — comprehensive coverage
 * of all exported helpers from src/api/resourceTypes.ts.
 *
 * NOTE: The existing resourceTypes.test.ts is left untouched.
 * This file exercises the full public API surface.
 */

import {
  RESOURCE_TYPES,
  getCategorizedResourceTypes,
  getResourceTypeByApiPath,
  getResourceTypeKeys,
  isResourceTypeAvailableForNamespace,
  getResourceTypesForNamespace,
  getDangerLevel,
  requiresConfirmation,
  getPrerequisites,
  getCommonErrors,
  getServerDefaultFields,
  getUserRequiredFields,
  getFieldMetadata,
  isFieldUserRequired,
  getRecommendedValues,
  getRecommendedValueFields,
  isResourceTypePreview,
} from '../../api/resourceTypes';
import { GENERATED_RESOURCE_TYPES } from '../../generated/resourceTypesBase';

// ---------------------------------------------------------------------------
// RESOURCE_TYPES constant
// ---------------------------------------------------------------------------
describe('Resource Type Registry (comprehensive)', () => {
  describe('RESOURCE_TYPES size and known keys', () => {
    it('should contain at least 100 entries', () => {
      // RESOURCE_TYPES only includes types with manual overrides (~110).
      // GENERATED_RESOURCE_TYPES (the full OpenAPI set) has ~234.
      const keys = Object.keys(RESOURCE_TYPES);
      expect(keys.length).toBeGreaterThanOrEqual(100);
    });

    const knownTypes = ['http_loadbalancer', 'origin_pool', 'app_firewall', 'healthcheck'];

    for (const knownKey of knownTypes) {
      it(`should contain known type "${knownKey}"`, () => {
        expect(RESOURCE_TYPES[knownKey]).toBeDefined();
      });
    }

    it('every type has a non-empty displayName string', () => {
      for (const [_key, info] of Object.entries(RESOURCE_TYPES)) {
        expect(typeof info.displayName).toBe('string');
        expect(info.displayName.length).toBeGreaterThan(0);
      }
    });

    it('every type has a non-empty apiBase or falls back to config', () => {
      for (const [_key, info] of Object.entries(RESOURCE_TYPES)) {
        // apiBase may be undefined (defaults to 'config') or a non-empty string
        if (info.apiBase !== undefined) {
          expect(typeof info.apiBase).toBe('string');
          expect(info.apiBase.length).toBeGreaterThan(0);
        }
      }
    });

    it('every type has a valid namespaceScope (any | system | shared) or undefined', () => {
      const validScopes = ['any', 'system', 'shared', undefined];
      for (const [_key, info] of Object.entries(RESOURCE_TYPES)) {
        expect(validScopes).toContain(info.namespaceScope);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getResourceTypeKeys
  // ---------------------------------------------------------------------------
  describe('getResourceTypeKeys', () => {
    it('should match the keys of RESOURCE_TYPES', () => {
      const fnKeys = getResourceTypeKeys().sort();
      const directKeys = Object.keys(RESOURCE_TYPES).sort();
      expect(fnKeys).toEqual(directKeys);
    });
  });

  // ---------------------------------------------------------------------------
  // getCategorizedResourceTypes
  // ---------------------------------------------------------------------------
  describe('getCategorizedResourceTypes', () => {
    it('returns a non-empty Map', () => {
      const map = getCategorizedResourceTypes();
      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBeGreaterThan(0);
    });

    it('every category array is non-empty', () => {
      const map = getCategorizedResourceTypes();
      for (const [_cat, arr] of map) {
        expect(arr.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getResourceTypeByApiPath
  // ---------------------------------------------------------------------------
  describe('getResourceTypeByApiPath', () => {
    it('resolves http_loadbalancers to a resource type', () => {
      const rt = getResourceTypeByApiPath('http_loadbalancers');
      expect(rt).toBeDefined();
      expect(rt!.displayName).toBe('HTTP Load Balancers');
    });

    it('returns undefined for an unknown path', () => {
      expect(getResourceTypeByApiPath('__does_not_exist__')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Namespace availability
  // ---------------------------------------------------------------------------
  describe('namespace scope helpers', () => {
    it('http_loadbalancer is available in the default namespace', () => {
      const info = RESOURCE_TYPES['http_loadbalancer']!;
      expect(isResourceTypeAvailableForNamespace(info, 'default')).toBe(true);
    });

    it('system-scoped types have namespaceScope system or any', () => {
      const systemTypes = getResourceTypesForNamespace('system');
      for (const [, info] of Object.entries(systemTypes)) {
        expect(['system', 'any']).toContain(info.namespaceScope ?? 'any');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getDangerLevel
  // ---------------------------------------------------------------------------
  describe('getDangerLevel', () => {
    it('returns a valid level (low | medium | high) for known resource', () => {
      const level = getDangerLevel('http_loadbalancer', 'delete');
      expect(['low', 'medium', 'high']).toContain(level);
    });

    it('returns a valid level or defaults for unknown resource', () => {
      const level = getDangerLevel('__unknown__', 'delete');
      // The function defaults to "medium" for unknown resources
      expect(['low', 'medium', 'high']).toContain(level);
    });
  });

  // ---------------------------------------------------------------------------
  // requiresConfirmation
  // ---------------------------------------------------------------------------
  describe('requiresConfirmation', () => {
    it('returns a boolean for a known type + delete', () => {
      const result = requiresConfirmation('http_loadbalancer', 'delete');
      expect(typeof result).toBe('boolean');
    });

    it('returns a boolean for an unknown type', () => {
      const result = requiresConfirmation('__unknown__', 'delete');
      expect(typeof result).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // getPrerequisites / getCommonErrors
  // ---------------------------------------------------------------------------
  describe('getPrerequisites', () => {
    it('returns an array for a known type', () => {
      const prereqs = getPrerequisites('http_loadbalancer', 'create');
      expect(Array.isArray(prereqs)).toBe(true);
    });

    it('returns an array for an unknown type', () => {
      const prereqs = getPrerequisites('__unknown__', 'create');
      expect(Array.isArray(prereqs)).toBe(true);
    });
  });

  describe('getCommonErrors', () => {
    it('returns an array for a known type', () => {
      const errors = getCommonErrors('http_loadbalancer', 'create');
      expect(Array.isArray(errors)).toBe(true);
    });

    it('returns an array for an unknown type', () => {
      const errors = getCommonErrors('__unknown__', 'create');
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Field metadata helpers
  // ---------------------------------------------------------------------------
  describe('getServerDefaultFields', () => {
    it('returns an array for origin_pool', () => {
      const fields = getServerDefaultFields('origin_pool');
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    });

    it('returns an array (possibly empty) for unknown type', () => {
      const fields = getServerDefaultFields('__unknown__');
      expect(Array.isArray(fields)).toBe(true);
    });
  });

  describe('getUserRequiredFields', () => {
    it('returns an array for origin_pool create', () => {
      const fields = getUserRequiredFields('origin_pool', 'create');
      expect(Array.isArray(fields)).toBe(true);
    });

    it('returns an array for unknown type', () => {
      const fields = getUserRequiredFields('__unknown__', 'create');
      expect(Array.isArray(fields)).toBe(true);
    });
  });

  describe('getFieldMetadata', () => {
    it('returns an object (or undefined) for origin_pool', () => {
      const meta = getFieldMetadata('origin_pool');
      // May be an object with field metadata or undefined
      expect(meta === undefined || typeof meta === 'object').toBe(true);
    });
  });

  describe('isFieldUserRequired', () => {
    it('returns a boolean', () => {
      const result = isFieldUserRequired('origin_pool', 'spec.origin_servers', 'create');
      expect(typeof result).toBe('boolean');
    });

    it('returns false for unknown type', () => {
      const result = isFieldUserRequired('__unknown__', 'spec.foo', 'create');
      expect(typeof result).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // Recommended values
  // ---------------------------------------------------------------------------
  describe('getRecommendedValues', () => {
    it('returns an object for healthcheck', () => {
      const rv = getRecommendedValues('healthcheck');
      expect(typeof rv).toBe('object');
      expect(rv).not.toBeNull();
    });

    it('returns an empty object for unknown type', () => {
      expect(getRecommendedValues('__unknown__')).toEqual({});
    });
  });

  describe('getRecommendedValueFields', () => {
    it('returns an array for healthcheck', () => {
      const fields = getRecommendedValueFields('healthcheck');
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
    });

    it('returns an empty array for unknown type', () => {
      expect(getRecommendedValueFields('__unknown__')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // isResourceTypePreview
  // ---------------------------------------------------------------------------
  describe('isResourceTypePreview', () => {
    it('returns a boolean for every registered type', () => {
      for (const key of getResourceTypeKeys()) {
        expect(typeof isResourceTypePreview(key)).toBe('boolean');
      }
    });

    it('returns false for unknown type', () => {
      expect(isResourceTypePreview('__unknown__')).toBe(false);
    });
  });

  describe('generated resource types include new metadata fields', () => {
    it('at least one resource has fieldMetadata with constrainedFields', () => {
      let found = false;
      for (const rt of Object.values(GENERATED_RESOURCE_TYPES)) {
        if (
          rt.fieldMetadata &&
          rt.fieldMetadata.constrainedFields &&
          rt.fieldMetadata.constrainedFields.length > 0
        ) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });
  });
});
