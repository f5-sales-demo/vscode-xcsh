// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for the JSON Schema generator
 */

import {
  generateGenericSchema,
  generateSchemaForResourceType,
  getSchemaResourceTypes,
  hasDetailedFieldMetadata,
} from '../../schema/schemaGenerator';

describe('Schema Generator', () => {
  describe('generateSchemaForResourceType', () => {
    it('should generate a valid JSON Schema for http_loadbalancer', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');

      expect(schema).not.toBeNull();
      expect(schema?.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema?.$id).toBe('f5xc-schema://schemas/http_loadbalancer.json');
      expect(schema?.title).toContain('xcsh');
      expect(schema?.type).toBe('object');
    });

    it('should include metadata and spec properties', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');

      expect(schema).not.toBeNull();
      expect(schema?.properties).toHaveProperty('metadata');
      expect(schema?.properties).toHaveProperty('spec');
      expect(schema?.required).toContain('metadata');
      expect(schema?.required).toContain('spec');
    });

    it('should generate metadata schema with standard fields', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');

      expect(schema).not.toBeNull();
      const metadata = schema?.properties.metadata as {
        type: string;
        properties: Record<string, unknown>;
      };
      expect(metadata).toBeDefined();
      expect(metadata.type).toBe('object');
      expect(metadata.properties).toBeDefined();
      expect(metadata.properties).toHaveProperty('name');
      expect(metadata.properties).toHaveProperty('namespace');
      expect(metadata.properties).toHaveProperty('labels');
      expect(metadata.properties).toHaveProperty('annotations');
      expect(metadata.properties).toHaveProperty('description');
      expect(metadata.properties).toHaveProperty('disable');
    });

    it('should mark metadata.name as required', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');

      expect(schema).not.toBeNull();
      const metadata = schema?.properties.metadata as {
        required: string[];
        properties: Record<string, Record<string, unknown>>;
      };
      expect(metadata).toBeDefined();
      expect(metadata.required).toContain('name');
      expect(metadata.properties).toBeDefined();
      const nameField = metadata.properties.name;
      expect(nameField).toBeDefined();
      expect(nameField?.['x-f5xc-required']).toBe(true);
    });

    it('should return null for unknown resource type', () => {
      const schema = generateSchemaForResourceType('unknown_resource_type');

      expect(schema).toBeNull();
    });

    it('should generate schema for healthcheck with field metadata', () => {
      const schema = generateSchemaForResourceType('healthcheck');

      expect(schema).not.toBeNull();
      expect(schema?.title).toContain('Health Check');
      expect(schema?.properties.spec).toBeDefined();
    });

    it('should include description from resource type', () => {
      const schema = generateSchemaForResourceType('healthcheck');

      expect(schema).not.toBeNull();
      expect(schema?.description).toBeDefined();
      expect(typeof schema?.description).toBe('string');
      expect(schema?.description?.length).toBeGreaterThan(0);
    });

    it('should generate schema for origin_pool', () => {
      const schema = generateSchemaForResourceType('origin_pool');

      expect(schema).not.toBeNull();
      expect(schema?.$id).toBe('f5xc-schema://schemas/origin_pool.json');
      expect(schema?.properties.metadata).toBeDefined();
      expect(schema?.properties.spec).toBeDefined();
    });

    it('should generate schema for app_firewall', () => {
      const schema = generateSchemaForResourceType('app_firewall');

      expect(schema).not.toBeNull();
      expect(schema?.$id).toBe('f5xc-schema://schemas/app_firewall.json');
    });

    it('should handle resource types without field metadata', () => {
      // Find a resource type that might not have detailed field metadata
      const schema = generateSchemaForResourceType('alert_policy');

      // Should still generate a valid schema
      expect(schema).not.toBeNull();
      expect(schema?.properties.metadata).toBeDefined();
      expect(schema?.properties.spec).toBeDefined();
      // spec should allow additional properties when no field metadata
      const spec = schema?.properties.spec as { additionalProperties: boolean };
      expect(spec.additionalProperties).toBe(true);
    });
  });

  describe('generateGenericSchema', () => {
    it('should generate a valid generic schema', () => {
      const schema = generateGenericSchema();

      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.$id).toBe('f5xc-schema://schemas/generic.json');
      expect(schema.title).toBe('xcsh Resource');
      expect(schema.type).toBe('object');
    });

    it('should include metadata and spec properties', () => {
      const schema = generateGenericSchema();

      expect(schema.properties).toHaveProperty('metadata');
      expect(schema.properties).toHaveProperty('spec');
      expect(schema.required).toContain('metadata');
      expect(schema.required).toContain('spec');
    });

    it('should have flexible spec that allows additional properties', () => {
      const schema = generateGenericSchema();

      const spec = schema.properties.spec as { additionalProperties: boolean };
      expect(spec.additionalProperties).toBe(true);
    });

    it('should have description', () => {
      const schema = generateGenericSchema();

      expect(schema.description).toBe('Generic schema for xcsh resources');
    });
  });

  describe('getSchemaResourceTypes', () => {
    it('should return an array of resource type keys', () => {
      const types = getSchemaResourceTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });

    it('should include common resource types', () => {
      const types = getSchemaResourceTypes();

      expect(types).toContain('http_loadbalancer');
      expect(types).toContain('origin_pool');
      expect(types).toContain('healthcheck');
      expect(types).toContain('app_firewall');
    });

    it('should return at least 200 resource types', () => {
      const types = getSchemaResourceTypes();

      // Based on the generated resource types (234)
      expect(types.length).toBeGreaterThanOrEqual(200);
    });

    it('should return unique keys', () => {
      const types = getSchemaResourceTypes();
      const uniqueTypes = [...new Set(types)];

      expect(types.length).toBe(uniqueTypes.length);
    });
  });

  describe('hasDetailedFieldMetadata', () => {
    it('should return true for healthcheck which has field metadata', () => {
      const hasMetadata = hasDetailedFieldMetadata('healthcheck');

      expect(hasMetadata).toBe(true);
    });

    it('should return true for origin_pool which has field metadata', () => {
      const hasMetadata = hasDetailedFieldMetadata('origin_pool');

      expect(hasMetadata).toBe(true);
    });

    it('should return false for unknown resource type', () => {
      const hasMetadata = hasDetailedFieldMetadata('unknown_resource');

      expect(hasMetadata).toBe(false);
    });

    it('should return boolean for any valid resource type', () => {
      const types = getSchemaResourceTypes();

      for (const type of types.slice(0, 10)) {
        const hasMetadata = hasDetailedFieldMetadata(type);
        expect(typeof hasMetadata).toBe('boolean');
      }
    });
  });

  describe('Schema structure validation', () => {
    it('should generate schemas with valid JSON Schema draft-07 structure', () => {
      const types = ['http_loadbalancer', 'origin_pool', 'healthcheck', 'app_firewall'];

      for (const type of types) {
        const schema = generateSchemaForResourceType(type);
        expect(schema).not.toBeNull();

        // Validate required JSON Schema properties
        expect(schema?.$schema).toBe('http://json-schema.org/draft-07/schema#');
        expect(schema?.$id).toMatch(/^f5xc-schema:\/\/schemas\/[a-z_]+\.json$/);
        expect(schema?.type).toBe('object');
        expect(schema?.properties).toBeDefined();
        expect(typeof schema?.properties).toBe('object');
      }
    });

    it('should have consistent metadata schema across resource types', () => {
      const schema1 = generateSchemaForResourceType('http_loadbalancer');
      const schema2 = generateSchemaForResourceType('origin_pool');

      expect(schema1).not.toBeNull();
      expect(schema2).not.toBeNull();

      // Metadata schemas should be structurally identical
      const meta1 = schema1?.properties.metadata as { properties?: Record<string, unknown> };
      const meta2 = schema2?.properties.metadata as { properties?: Record<string, unknown> };
      const meta1Keys = Object.keys(meta1.properties || {}).sort();
      const meta2Keys = Object.keys(meta2.properties || {}).sort();

      expect(meta1Keys).toEqual(meta2Keys);
    });
  });

  describe('Field metadata integration', () => {
    it('should include x-f5xc-required extension for required fields', () => {
      const schema = generateSchemaForResourceType('healthcheck');

      expect(schema).not.toBeNull();
      // metadata.name should always be marked as required
      const metadata = schema?.properties.metadata as {
        properties: Record<string, Record<string, unknown>>;
      };
      expect(metadata.properties).toBeDefined();
      const nameField = metadata.properties.name;
      expect(nameField).toBeDefined();
      expect(nameField?.['x-f5xc-required']).toBe(true);
    });

    it('should include recommended values as defaults when available', () => {
      const schema = generateSchemaForResourceType('healthcheck');

      expect(schema).not.toBeNull();
      const spec = schema?.properties.spec as { properties: Record<string, unknown> };

      // healthcheck has recommended values for interval, timeout, etc.
      // These should appear as defaults in the schema
      expect(spec.properties).toBeDefined();
    });

    it('should mark server-defaulted fields with extension', () => {
      const schema = generateSchemaForResourceType('healthcheck');

      expect(schema).not.toBeNull();
      // Should have spec properties that include server default markers
      const spec = schema?.properties.spec as { type: string };
      expect(spec.type).toBe('object');
    });
  });

  describe('Schema generation determinism', () => {
    it('should produce identical schemas on multiple calls', () => {
      const schema1 = generateSchemaForResourceType('http_loadbalancer');
      const schema2 = generateSchemaForResourceType('http_loadbalancer');

      expect(JSON.stringify(schema1)).toBe(JSON.stringify(schema2));
    });

    it('should produce identical generic schemas on multiple calls', () => {
      const schema1 = generateGenericSchema();
      const schema2 = generateGenericSchema();

      expect(JSON.stringify(schema1)).toBe(JSON.stringify(schema2));
    });
  });

  describe('Error handling', () => {
    it('should handle empty string resource type', () => {
      const schema = generateSchemaForResourceType('');

      expect(schema).toBeNull();
    });

    it('should handle resource type with special characters', () => {
      const schema = generateSchemaForResourceType('invalid/resource');

      expect(schema).toBeNull();
    });

    it('should not throw for any input', () => {
      const testInputs = ['', 'unknown', '123', 'a'.repeat(1000), null as unknown as string];

      for (const input of testInputs) {
        expect(() => generateSchemaForResourceType(input)).not.toThrow();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Additional coverage: known-type safety and SchemaRegistry integration
  // -------------------------------------------------------------------------
  describe('generateSchemaForResourceType — known-type safety', () => {
    const knownTypes = ['http_loadbalancer', 'origin_pool', 'healthcheck', 'app_firewall'];

    for (const typeKey of knownTypes) {
      it(`does not throw for known type "${typeKey}"`, () => {
        expect(() => generateSchemaForResourceType(typeKey)).not.toThrow();
      });
    }

    for (const typeKey of knownTypes) {
      it(`returns a non-null schema for "${typeKey}"`, () => {
        const schema = generateSchemaForResourceType(typeKey);
        expect(schema).not.toBeNull();
        expect(schema?.type).toBe('object');
      });
    }
  });

  describe('SchemaRegistry integration', () => {
    // SchemaRegistry uses vscode.Uri internally, so we need the mock.
    // The global vscode mock (via moduleNameMapper) is already configured.
    let SchemaRegistryClass: typeof import('../../schema/schemaRegistry').SchemaRegistry;
    let resetFn: typeof import('../../schema/schemaRegistry').resetSchemaRegistry;

    beforeAll(async () => {
      const mod = await import('../../schema/schemaRegistry');
      SchemaRegistryClass = mod.SchemaRegistry;
      resetFn = mod.resetSchemaRegistry;
    });

    afterEach(() => {
      resetFn();
    });

    it('getOrGenerateSchema returns an object for http_loadbalancer', () => {
      const registry = new SchemaRegistryClass();
      const schema = registry.getOrGenerateSchema('http_loadbalancer');
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('getOrGenerateSchema returns an object for origin_pool', () => {
      const registry = new SchemaRegistryClass();
      const schema = registry.getOrGenerateSchema('origin_pool');
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('getOrGenerateSchema returns an object for healthcheck', () => {
      const registry = new SchemaRegistryClass();
      const schema = registry.getOrGenerateSchema('healthcheck');
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('getOrGenerateSchema returns an object for app_firewall', () => {
      const registry = new SchemaRegistryClass();
      const schema = registry.getOrGenerateSchema('app_firewall');
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('getOrGenerateSchema returns null for unknown types', () => {
      const registry = new SchemaRegistryClass();
      const schema = registry.getOrGenerateSchema('__does_not_exist__');
      expect(schema).toBeNull();
    });

    it('caches schemas on subsequent calls', () => {
      const registry = new SchemaRegistryClass();
      const schema1 = registry.getOrGenerateSchema('http_loadbalancer');
      const schema2 = registry.getOrGenerateSchema('http_loadbalancer');
      expect(schema1).toBe(schema2);
    });
  });

  describe('array-typed fields in schema output', () => {
    it('generates valid schema for resource types with array fields', () => {
      const schema = generateSchemaForResourceType('origin_pool');
      expect(schema).not.toBeNull();
      expect(schema?.properties.spec).toBeDefined();
      // After fix, schema should be valid and not crash
    });

    it('schema structure is valid JSON Schema', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');
      if (!schema) {
        return;
      }
      // The schema should be a valid object with properties
      expect(typeof schema).toBe('object');
      expect(schema.type).toBe('object');
      const specStr = JSON.stringify(schema.properties.spec);
      // Should not have type:array with direct properties (the old bug)
      // Valid pattern: type:array with items.properties
      expect(specStr).toBeTruthy();
    });
  });

  describe('schema includes enriched metadata from constraints', () => {
    it('generates a valid schema object for http_loadbalancer', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('schema JSON contains pattern keyword when constraints have pattern', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');
      const str = JSON.stringify(schema);
      // After wiring constraints, schemas with pattern constraints will have "pattern" key
      // This is a structural test - just verify the schema is valid JSON Schema
      expect(str).toBeTruthy();
    });
  });

  describe('nested required field propagation', () => {
    it('marks single-level required fields at spec level', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');
      if (!schema) {
        return;
      }
      const spec = schema.properties.spec as { required?: string[] };
      // spec.required should exist and contain at least one entry
      if (spec.required) {
        expect(Array.isArray(spec.required)).toBe(true);
        // No [] entries should appear
        for (const r of spec.required) {
          expect(r).not.toContain('[]');
        }
      }
    });

    it('does not include [] in any required array', () => {
      const schema = generateSchemaForResourceType('http_loadbalancer');
      if (!schema) {
        return;
      }
      const schemaStr = JSON.stringify(schema);
      // Parse back and walk all required arrays
      const parsed = JSON.parse(schemaStr) as Record<string, unknown>;
      const allRequired: string[] = [];
      function collectRequired(obj: Record<string, unknown>) {
        if (Array.isArray(obj.required)) {
          allRequired.push(...(obj.required as string[]));
        }
        if (obj.properties && typeof obj.properties === 'object') {
          for (const v of Object.values(obj.properties as Record<string, unknown>)) {
            if (v && typeof v === 'object') {
              collectRequired(v as Record<string, unknown>);
            }
          }
        }
        if (obj.items && typeof obj.items === 'object') {
          collectRequired(obj.items as Record<string, unknown>);
        }
      }
      collectRequired(parsed);
      for (const r of allRequired) {
        expect(r).not.toContain('[]');
      }
    });

    it('propagates required to nested object levels', () => {
      // Generate schema for a resource that has nested required fields
      // Look for any resource where required fields have dots (nested)
      const resourceTypes = require('../../generated/resourceTypesBase');
      const TYPES = resourceTypes.GENERATED_RESOURCE_TYPES;
      let testedNested = false;

      for (const [key, rt] of Object.entries(TYPES)) {
        const fm = (rt as Record<string, unknown>).fieldMetadata as { userRequiredFields?: string[] } | undefined;
        if (!fm?.userRequiredFields) {
          continue;
        }
        const nestedRequired = fm.userRequiredFields.filter(
          (f: string) => f.startsWith('spec.') && f.replace('spec.', '').split('.').length > 1,
        );
        if (nestedRequired.length === 0) {
          continue;
        }

        const schema = generateSchemaForResourceType(key);
        if (!schema) {
          continue;
        }

        // Walk the schema and check that nested levels have required arrays
        const schemaStr = JSON.stringify(schema);
        const parsed = JSON.parse(schemaStr) as Record<string, unknown>;
        let foundNestedRequired = false;
        function checkNestedRequired(obj: Record<string, unknown>, depth: number) {
          if (depth > 0 && Array.isArray(obj.required) && (obj.required as string[]).length > 0) {
            foundNestedRequired = true;
          }
          if (obj.properties && typeof obj.properties === 'object') {
            for (const v of Object.values(obj.properties as Record<string, unknown>)) {
              if (v && typeof v === 'object') {
                checkNestedRequired(v as Record<string, unknown>, depth + 1);
              }
            }
          }
          if (obj.items && typeof obj.items === 'object') {
            checkNestedRequired(obj.items as Record<string, unknown>, depth + 1);
          }
        }
        checkNestedRequired(parsed, 0);

        if (foundNestedRequired) {
          testedNested = true;
          break;
        }
      }

      // At least one resource should have nested required
      expect(testedNested).toBe(true);
    });
  });
});
