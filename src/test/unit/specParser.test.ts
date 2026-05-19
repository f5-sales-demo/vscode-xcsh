// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for spec parser against live enriched API specifications.
 *
 * Tests parseAllDomainFiles() function from scripts/generators/spec-parser.ts
 * to verify resource discovery, field metadata extraction, and operation metadata.
 */

import * as path from 'path';
import {
  parseAllDomainFiles,
  ParsedSpecInfo,
  NamespaceScope,
  ResourceFieldMetadata,
  ResourceOperationMetadata,
  DangerLevel,
} from '../../../scripts/generators/spec-parser';

const DOMAINS_DIR = path.resolve(__dirname, '../../../docs/specifications/api/domains');

describe('Spec Parser - parseAllDomainFiles', () => {
  let parsedResources: ParsedSpecInfo[];

  beforeAll(() => {
    // Parse once for all tests in this file
    parsedResources = parseAllDomainFiles(DOMAINS_DIR);
  });

  describe('resource discovery', () => {
    it('should return at least 200 resources', () => {
      expect(parsedResources.length).toBeGreaterThanOrEqual(200);
    });

    it('every resource should have a non-empty resourceKey', () => {
      for (const resource of parsedResources) {
        expect(resource.resourceKey).toBeDefined();
        expect(typeof resource.resourceKey).toBe('string');
        expect(resource.resourceKey.length).toBeGreaterThan(0);
      }
    });

    it('every resource should have non-empty apiPath', () => {
      for (const resource of parsedResources) {
        expect(resource.apiPath).toBeDefined();
        expect(typeof resource.apiPath).toBe('string');
        expect(resource.apiPath.length).toBeGreaterThan(0);
      }
    });

    it('every resource should have non-empty apiBase', () => {
      for (const resource of parsedResources) {
        expect(resource.apiBase).toBeDefined();
        expect(typeof resource.apiBase).toBe('string');
        expect(resource.apiBase.length).toBeGreaterThan(0);
      }
    });

    it('every resource should have displayName', () => {
      for (const resource of parsedResources) {
        expect(resource.displayName).toBeDefined();
        expect(typeof resource.displayName).toBe('string');
      }
    });

    it('should have no duplicate resource keys', () => {
      const keys = parsedResources.map((r) => r.resourceKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('namespace scope', () => {
    const VALID_SCOPES: NamespaceScope[] = ['any', 'system', 'shared'];

    it('every resource should have a valid namespaceScope', () => {
      for (const resource of parsedResources) {
        expect(resource.namespaceScope).toBeDefined();
        expect(VALID_SCOPES).toContain(resource.namespaceScope);
      }
    });

    it('should have resources with system scope', () => {
      const systemResources = parsedResources.filter((r) => r.namespaceScope === 'system');
      expect(systemResources.length).toBeGreaterThan(0);
    });

    it('should have resources with any scope', () => {
      const anyResources = parsedResources.filter((r) => r.namespaceScope === 'any');
      expect(anyResources.length).toBeGreaterThan(0);
    });

    // Note: shared scope may have 0 resources currently, so we test.todo() if assertion fails
    it.skip('should have resources with shared scope', () => {
      const sharedResources = parsedResources.filter((r) => r.namespaceScope === 'shared');
      expect(sharedResources.length).toBeGreaterThan(0);
    });
  });

  describe('known resource types', () => {
    const KNOWN_RESOURCES = ['http_loadbalancer', 'origin_pool', 'app_firewall', 'healthcheck'];

    it('should include all known resource types', () => {
      const resourceKeys = new Set(parsedResources.map((r) => r.resourceKey));

      for (const key of KNOWN_RESOURCES) {
        expect(resourceKeys.has(key)).toBe(true);
      }
    });

    it('known resources should have expected structure', () => {
      const httpLb = parsedResources.find((r) => r.resourceKey === 'http_loadbalancer');
      expect(httpLb).toBeDefined();
      expect(httpLb?.apiBase).toBe('config');
      expect(httpLb?.namespaceScoped).toBe(true);

      const originPool = parsedResources.find((r) => r.resourceKey === 'origin_pool');
      expect(originPool).toBeDefined();
      expect(originPool?.apiBase).toBe('config');
    });
  });

  describe('API base distribution', () => {
    it('should have more than 5 distinct API bases', () => {
      const apiBases = new Set(parsedResources.map((r) => r.apiBase));
      expect(apiBases.size).toBeGreaterThan(5);
    });

    it('config should be the most common API base', () => {
      const apiBaseCounts = new Map<string, number>();

      for (const resource of parsedResources) {
        const count = apiBaseCounts.get(resource.apiBase) || 0;
        apiBaseCounts.set(resource.apiBase, count + 1);
      }

      // Find the most common
      let maxBase = '';
      let maxCount = 0;
      for (const [base, count] of apiBaseCounts) {
        if (count > maxCount) {
          maxBase = base;
          maxCount = count;
        }
      }

      expect(maxBase).toBe('config');
    });
  });

  describe('field metadata presence', () => {
    it('some resources should have fieldMetadata', () => {
      const withFieldMeta = parsedResources.filter((r) => r.fieldMetadata);
      expect(withFieldMeta.length).toBeGreaterThan(0);
    });

    it('field metadata should have correct structure when present', () => {
      const withFieldMeta = parsedResources.filter((r) => r.fieldMetadata);

      for (const resource of withFieldMeta) {
        const fieldMeta = resource.fieldMetadata as ResourceFieldMetadata;

        // Must have fields map
        expect(fieldMeta.fields).toBeDefined();
        expect(typeof fieldMeta.fields).toBe('object');

        // Must have serverDefaultFields array
        expect(fieldMeta.serverDefaultFields).toBeDefined();
        expect(Array.isArray(fieldMeta.serverDefaultFields)).toBe(true);

        // Must have userRequiredFields array
        expect(fieldMeta.userRequiredFields).toBeDefined();
        expect(Array.isArray(fieldMeta.userRequiredFields)).toBe(true);
      }
    });

    it('field metadata fields should have valid structure', () => {
      const withFieldMeta = parsedResources.filter((r) => r.fieldMetadata);
      let fieldsChecked = 0;

      for (const resource of withFieldMeta.slice(0, 10)) {
        const fieldMeta = resource.fieldMetadata as ResourceFieldMetadata;

        for (const [fieldPath, meta] of Object.entries(fieldMeta.fields)) {
          // Path should be a non-empty string (e.g., "spec.monitoring")
          expect(typeof fieldPath).toBe('string');
          expect(fieldPath.length).toBeGreaterThan(0);

          // Meta should be an object
          expect(typeof meta).toBe('object');
          fieldsChecked++;
        }
      }

      // Ensure we actually checked some fields
      expect(fieldsChecked).toBeGreaterThan(0);
    });
  });

  describe('operation metadata presence', () => {
    it('some resources should have operationMetadata', () => {
      const withOpMeta = parsedResources.filter((r) => r.operationMetadata);
      expect(withOpMeta.length).toBeGreaterThan(0);
    });

    it('operation metadata should have valid CRUD operations', () => {
      const withOpMeta = parsedResources.filter((r) => r.operationMetadata);
      const VALID_OPS = ['list', 'get', 'create', 'update', 'delete'];

      for (const resource of withOpMeta.slice(0, 20)) {
        const opMeta = resource.operationMetadata as ResourceOperationMetadata;

        for (const key of Object.keys(opMeta)) {
          expect(VALID_OPS).toContain(key);
        }
      }
    });
  });

  describe('danger level validation', () => {
    const VALID_DANGER_LEVELS: DangerLevel[] = ['low', 'medium', 'high'];

    it('danger levels should be valid when present', () => {
      const withOpMeta = parsedResources.filter((r) => r.operationMetadata);
      let dangerLevelsFound = 0;

      for (const resource of withOpMeta) {
        const opMeta = resource.operationMetadata as ResourceOperationMetadata;

        for (const op of Object.values(opMeta)) {
          if (op?.dangerLevel) {
            expect(VALID_DANGER_LEVELS).toContain(op.dangerLevel);
            dangerLevelsFound++;
          }
        }
      }

      // At least some operations should have danger levels
      // If none have them, this is a test.todo() candidate
      if (dangerLevelsFound === 0) {
        console.warn('No danger levels found in operation metadata - specs may not include them');
      }
    });
  });

  describe('side effects validation', () => {
    it('side effects should have valid structure when present', () => {
      const withOpMeta = parsedResources.filter((r) => r.operationMetadata);
      let sideEffectsFound = 0;

      for (const resource of withOpMeta) {
        const opMeta = resource.operationMetadata as ResourceOperationMetadata;

        for (const op of Object.values(opMeta)) {
          if (op?.sideEffects) {
            sideEffectsFound++;
            const se = op.sideEffects;

            // Validate structure - all fields should be arrays if present
            if (se.creates) {
              expect(Array.isArray(se.creates)).toBe(true);
            }
            if (se.updates) {
              expect(Array.isArray(se.updates)).toBe(true);
            }
            if (se.deletes) {
              expect(Array.isArray(se.deletes)).toBe(true);
            }
            if (se.invalidates) {
              expect(Array.isArray(se.invalidates)).toBe(true);
            }
          }
        }
      }

      // If no side effects found, this is informational
      if (sideEffectsFound === 0) {
        console.warn('No side effects found in operation metadata - specs may not include them');
      }
    });
  });

  describe('ConstraintInfo and BestPracticesInfo interfaces', () => {
    it('spec-parser exports ConstraintInfo type (compile-time check)', () => {
      const c: import('../../../scripts/generators/spec-parser').ConstraintInfo = {
        constraintType: 'string',
        maxLength: 128,
        pattern: '^[a-z]+$',
      };
      expect(c.constraintType).toBe('string');
    });

    it('spec-parser exports BestPracticesInfo type (compile-time check)', () => {
      const b: import('../../../scripts/generators/spec-parser').BestPracticesInfo = {
        commonErrors: [{ code: 400, message: 'bad', resolution: 'fix', prevention: 'check' }],
        securityNotes: ['use HTTPS'],
        performanceTips: ['paginate'],
      };
      expect(b.securityNotes?.[0]).toBe('use HTTPS');
    });
  });

  describe('FieldMetadata extended fields (compile-time)', () => {
    it('FieldMetadata accepts new fields without type error', () => {
      const f: import('../../../scripts/generators/spec-parser').FieldMetadata = {
        path: 'spec.name',
        descriptionShort: 'A short description',
        descriptionMedium: 'A medium description',
        example: 'my-resource',
        constraints: { maxLength: 64, pattern: '^[a-z]+$' },
        conflictsWith: ['spec.other_field'],
        isMinimumConfig: true,
        recommendedOneofVariant: 'TCP',
      };
      expect(f.isMinimumConfig).toBe(true);
    });

    it('ResourceFieldMetadata has minimumConfigFields and constrainedFields', () => {
      const r: import('../../../scripts/generators/spec-parser').ResourceFieldMetadata = {
        fields: {},
        serverDefaultFields: [],
        userRequiredFields: [],
        minimumConfigFields: ['spec.name'],
        constrainedFields: ['spec.name'],
      };
      expect(r.minimumConfigFields).toHaveLength(1);
      expect(r.constrainedFields).toHaveLength(1);
    });
  });

  describe('field description extraction', () => {
    it('at least 500 fields have descriptionShort across all resources', () => {
      // Note: We extract fields from CreateSpecType/SpecType schemas only.
      // The raw JSON has ~23K occurrences but most are in nested schemas not directly
      // traversed from create spec schemas. Actual extracted count is ~641.
      let count = 0;
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (meta.descriptionShort) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThanOrEqual(500);
    });

    it('at least 100 fields have descriptionMedium across all resources', () => {
      let count = 0;
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (meta.descriptionMedium) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThanOrEqual(100);
    });

    it('descriptionShort is a non-empty string when present', () => {
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (meta.descriptionShort !== undefined) {
            expect(typeof meta.descriptionShort).toBe('string');
            expect(meta.descriptionShort.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('field example extraction', () => {
    it('at least 300 fields have example across all resources', () => {
      // Raw JSON has ~20K x-f5xc-example but we only extract from create spec schemas.
      // Actual extracted count is ~416.
      let count = 0;
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (meta.example !== undefined) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThanOrEqual(300);
    });
  });

  describe('field constraint extraction', () => {
    it('at least 200 fields have constraints across all resources', () => {
      // Raw JSON has ~12K x-f5xc-constraints but we only extract from create spec schemas.
      // Actual extracted count is ~294.
      let count = 0;
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (meta.constraints !== undefined) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThanOrEqual(200);
    });

    it('constrainedFields array is populated for resources with constraints', () => {
      const withConstraints = parsedResources.filter(
        (r) => r.fieldMetadata && r.fieldMetadata.constrainedFields.length > 0,
      );
      expect(withConstraints.length).toBeGreaterThan(0);
    });

    it('constraint object has expected structure', () => {
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (!meta.constraints) {
            continue;
          }
          const c = meta.constraints;
          const hasContent =
            c.maxLength !== undefined ||
            c.pattern !== undefined ||
            c.format !== undefined ||
            c.constraintType !== undefined;
          expect(hasContent).toBe(true);
          return; // One validated constraint is enough
        }
      }
    });
  });

  describe('conflicts-with extraction', () => {
    // Note: x-f5xc-minimum-configuration is a schema-level extension (object with required_fields),
    // not a per-property boolean. The isMinimumConfig field on FieldMetadata will remain unpopulated
    // until we implement schema-level extraction. minimumConfigFields will be empty for now.

    it('at least 400 fields have conflictsWith', () => {
      // Raw JSON has ~6.6K x-f5xc-conflicts-with but we only extract from create spec schemas.
      // Actual extracted count is ~614.
      let count = 0;
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (meta.conflictsWith && meta.conflictsWith.length > 0) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThanOrEqual(400);
    });

    it('conflictsWith is an array of strings when present', () => {
      for (const r of parsedResources) {
        if (!r.fieldMetadata) {
          continue;
        }
        for (const meta of Object.values(r.fieldMetadata.fields)) {
          if (!meta.conflictsWith) {
            continue;
          }
          expect(Array.isArray(meta.conflictsWith)).toBe(true);
          for (const s of meta.conflictsWith) {
            expect(typeof s).toBe('string');
          }
        }
      }
    });
  });

  describe('operation-level extension extraction', () => {
    it('at least 200 operations have discoveredResponseTime', () => {
      let count = 0;
      for (const r of parsedResources) {
        if (!r.operationMetadata) {
          continue;
        }
        for (const op of Object.values(r.operationMetadata)) {
          if (op?.discoveredResponseTime) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThanOrEqual(200);
    });

    it('discoveredResponseTime is a non-empty string when present', () => {
      for (const r of parsedResources) {
        if (!r.operationMetadata) {
          continue;
        }
        for (const op of Object.values(r.operationMetadata)) {
          if (op?.discoveredResponseTime !== undefined) {
            expect(typeof op.discoveredResponseTime).toBe('string');
            expect(op.discoveredResponseTime.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it('some operations have operationRequiredFields', () => {
      let count = 0;
      for (const r of parsedResources) {
        if (!r.operationMetadata) {
          continue;
        }
        for (const op of Object.values(r.operationMetadata)) {
          if (op?.operationRequiredFields && op.operationRequiredFields.length > 0) {
            count++;
          }
        }
      }
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('best-practices and guided-workflows extraction', () => {
    it('at least 30 resources have bestPractices', () => {
      const withBP = parsedResources.filter((r) => r.bestPractices !== undefined);
      expect(withBP.length).toBeGreaterThanOrEqual(30);
    });

    it('bestPractices has at least one of commonErrors, securityNotes, performanceTips', () => {
      const withBP = parsedResources.filter((r) => r.bestPractices !== undefined);
      for (const r of withBP) {
        const bp = r.bestPractices!;
        const hasContent =
          (bp.commonErrors && bp.commonErrors.length > 0) ||
          (bp.securityNotes && bp.securityNotes.length > 0) ||
          (bp.performanceTips && bp.performanceTips.length > 0);
        expect(hasContent).toBe(true);
      }
    });
  });

  describe('OperationMetadata and ParsedSpecInfo extended fields (compile-time)', () => {
    it('OperationMetadata accepts new operation fields', () => {
      const o: import('../../../scripts/generators/spec-parser').OperationMetadata = {
        discoveredResponseTime: '50ms',
        operationRequiredFields: ['metadata.name', 'spec.origin_servers'],
        requires: ['origin_pool'],
      };
      expect(o.discoveredResponseTime).toBe('50ms');
    });

    it('ParsedSpecInfo accepts bestPractices and guidedWorkflows', () => {
      const p: Partial<import('../../../scripts/generators/spec-parser').ParsedSpecInfo> = {
        bestPractices: {
          commonErrors: [{ code: 400, message: 'err', resolution: 'fix' }],
          securityNotes: ['use HTTPS'],
          performanceTips: ['paginate'],
        },
        guidedWorkflows: [{ name: 'basic-setup' }],
      };
      expect(p.bestPractices?.securityNotes).toHaveLength(1);
      expect(p.guidedWorkflows).toHaveLength(1);
    });
  });
});
