// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for loadValidationData() in spec-parser.ts and its integration
 * with generateResourceTypesFromDomainFiles() in resource-type-generator.ts.
 *
 * Tests verify:
 * 1. loadValidationData() loads and parses validation.json correctly
 * 2. Returns resource entries with create and minimum_config arrays
 * 3. Returns null for non-existent file
 * 4. Returns null for malformed JSON
 * 5. Integration: generateResourceTypesFromDomainFiles() merges validation data
 *    into fieldMetadata.minimumConfigFields for known resources
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateResourceTypesFromDomainFiles } from '../../../scripts/generators/resource-type-generator';
import { loadValidationData, type ValidationResourceEntry } from '../../../scripts/generators/spec-parser';

const DOMAINS_DIR = path.resolve(__dirname, '../../../docs/specifications/api/domains');
const VALIDATION_PATH = path.join(DOMAINS_DIR, 'validation.json');
const NAMESPACE_PROFILES_PATH = path.join(DOMAINS_DIR, 'namespace_profiles.json');

describe('loadValidationData()', () => {
  describe('loading the real validation.json', () => {
    it('loads and parses the real validation.json without error', () => {
      const data = loadValidationData(VALIDATION_PATH);
      expect(data).not.toBeNull();
    });

    it('returns an object with required_fields.resources', () => {
      const data = loadValidationData(VALIDATION_PATH);
      expect(data).not.toBeNull();
      expect(data?.required_fields).toBeDefined();
      expect(data?.required_fields.resources).toBeDefined();
      expect(typeof data?.required_fields.resources).toBe('object');
    });

    it('returns at least one resource entry', () => {
      const data = loadValidationData(VALIDATION_PATH);
      expect(data).not.toBeNull();
      const resourceCount = Object.keys(data?.required_fields.resources ?? {}).length;
      expect(resourceCount).toBeGreaterThan(0);
    });

    it('http_loadbalancer entry has create array with metadata.name', () => {
      const data = loadValidationData(VALIDATION_PATH);
      expect(data).not.toBeNull();
      const entry: ValidationResourceEntry | undefined = data?.required_fields.resources.http_loadbalancer;
      expect(entry).toBeDefined();
      expect(Array.isArray(entry?.create)).toBe(true);
      expect(entry?.create).toContain('metadata.name');
    });

    it('http_loadbalancer entry has minimum_config array with metadata.name', () => {
      const data = loadValidationData(VALIDATION_PATH);
      expect(data).not.toBeNull();
      const entry: ValidationResourceEntry | undefined = data?.required_fields.resources.http_loadbalancer;
      expect(entry).toBeDefined();
      expect(Array.isArray(entry?.minimum_config)).toBe(true);
      expect(entry?.minimum_config).toContain('metadata.name');
    });
  });

  describe('error handling', () => {
    it('returns null for a non-existent file path', () => {
      const result = loadValidationData('/tmp/does-not-exist-xyz-abc-123/validation.json');
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON content', () => {
      const tmpFile = path.join(os.tmpdir(), 'malformed-validation.json');
      fs.writeFileSync(tmpFile, '{ this is not valid json {{{{ ', 'utf-8');
      try {
        const result = loadValidationData(tmpFile);
        expect(result).toBeNull();
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('returns null when required_fields.resources is missing', () => {
      const tmpFile = path.join(os.tmpdir(), 'incomplete-validation.json');
      fs.writeFileSync(tmpFile, JSON.stringify({ version: '1.0', required_fields: {} }), 'utf-8');
      try {
        const result = loadValidationData(tmpFile);
        expect(result).toBeNull();
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('returns null when required_fields is missing entirely', () => {
      const tmpFile = path.join(os.tmpdir(), 'no-required-fields.json');
      fs.writeFileSync(tmpFile, JSON.stringify({ version: '1.0' }), 'utf-8');
      try {
        const result = loadValidationData(tmpFile);
        expect(result).toBeNull();
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });
});

describe('generateResourceTypesFromDomainFiles() + validation.json integration', () => {
  let tmpOutputPath: string;

  beforeAll(() => {
    tmpOutputPath = path.join(os.tmpdir(), 'resourceTypesBase-test.ts');
  });

  afterAll(() => {
    if (fs.existsSync(tmpOutputPath)) {
      fs.unlinkSync(tmpOutputPath);
    }
  });

  it('generates resource types and merges validation data for http_loadbalancer', () => {
    const specs = generateResourceTypesFromDomainFiles(DOMAINS_DIR, tmpOutputPath, NAMESPACE_PROFILES_PATH);

    const hlb = specs.find((s) => s.resourceKey === 'http_loadbalancer');
    expect(hlb).toBeDefined();

    // After merge, fieldMetadata should exist with minimumConfigFields
    expect(hlb?.fieldMetadata).toBeDefined();
    expect(hlb?.fieldMetadata?.minimumConfigFields).toBeDefined();
    expect(Array.isArray(hlb?.fieldMetadata?.minimumConfigFields)).toBe(true);
    expect(hlb?.fieldMetadata?.minimumConfigFields).toContain('metadata.name');
  });

  it('merges userRequiredFields from validation create for http_loadbalancer', () => {
    const specs = generateResourceTypesFromDomainFiles(DOMAINS_DIR, tmpOutputPath, NAMESPACE_PROFILES_PATH);

    const hlb = specs.find((s) => s.resourceKey === 'http_loadbalancer');
    expect(hlb).toBeDefined();
    expect(hlb?.fieldMetadata?.userRequiredFields).toBeDefined();
    expect(hlb?.fieldMetadata?.userRequiredFields).toContain('metadata.name');
  });

  it('logs that validation data was merged', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      generateResourceTypesFromDomainFiles(DOMAINS_DIR, tmpOutputPath, NAMESPACE_PROFILES_PATH);
      const mergeLog = consoleSpy.mock.calls.find((call) => String(call[0]).includes('Merged validation data for'));
      expect(mergeLog).toBeDefined();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
