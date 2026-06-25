// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for API spec directory structure validation.
 *
 * Tests that the downloaded OpenAPI specifications from the F5 XC API
 * are correctly structured and contain the expected data.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SPEC_ROOT = path.resolve(__dirname, '../../../docs/specifications/api');
const DOMAINS_DIR = path.join(SPEC_ROOT, 'domains');

/**
 * Minimal OpenAPI spec structure for validation
 */
interface OpenAPISpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    'x-f5xc-cli-domain'?: string;
  };
  paths?: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
  };
}

describe('Spec Directory Structure', () => {
  describe('domains/ directory', () => {
    it('should exist', () => {
      expect(fs.existsSync(DOMAINS_DIR)).toBe(true);
    });

    it('should contain exactly 40 JSON files', () => {
      // OpenAPI domain files plus the two non-OpenAPI artifacts that ride along:
      // validation.json and namespace_profiles.json.
      const files = fs.readdirSync(DOMAINS_DIR).filter((f) => f.endsWith('.json'));
      expect(files.length).toBe(40);
    });
  });

  describe('domain file structure', () => {
    let domainFiles: string[];

    beforeAll(() => {
      domainFiles = fs.readdirSync(DOMAINS_DIR).filter((f) => f.endsWith('.json'));
    });

    it('each file should be valid JSON', () => {
      for (const filename of domainFiles) {
        const filePath = path.join(DOMAINS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(() => JSON.parse(content)).not.toThrow();
      }
    });

    it('OpenAPI domain files should have required keys (openapi, info, paths, components)', () => {
      // validation.json and namespace_profiles.json are non-OpenAPI artifacts, so we skip them
      const openApiFiles = domainFiles.filter((f) => f !== 'validation.json' && f !== 'namespace_profiles.json');

      for (const filename of openApiFiles) {
        const filePath = path.join(DOMAINS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = JSON.parse(content) as OpenAPISpec;

        expect(spec.openapi).toBeDefined();
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();
        expect(spec.components).toBeDefined();
      }
    });

    it('OpenAPI domain files should have x-f5xc-cli-domain in info', () => {
      // validation.json and namespace_profiles.json are non-OpenAPI artifacts, so we skip them
      const openApiFiles = domainFiles.filter((f) => f !== 'validation.json' && f !== 'namespace_profiles.json');

      for (const filename of openApiFiles) {
        const filePath = path.join(DOMAINS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = JSON.parse(content) as OpenAPISpec;

        expect(spec.info?.['x-f5xc-cli-domain']).toBeDefined();
        expect(typeof spec.info?.['x-f5xc-cli-domain']).toBe('string');
        expect(spec.info?.['x-f5xc-cli-domain']?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('aggregate statistics', () => {
    it('should have at least 1600 total API paths across all domain files', () => {
      const domainFiles = fs.readdirSync(DOMAINS_DIR).filter((f) => f.endsWith('.json'));
      let totalPaths = 0;

      for (const filename of domainFiles) {
        const filePath = path.join(DOMAINS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = JSON.parse(content) as OpenAPISpec;

        if (spec.paths) {
          totalPaths += Object.keys(spec.paths).length;
        }
      }

      expect(totalPaths).toBeGreaterThanOrEqual(1600);
    });

    it('should have at least 9000 total schemas across all domain files', () => {
      const domainFiles = fs.readdirSync(DOMAINS_DIR).filter((f) => f.endsWith('.json'));
      let totalSchemas = 0;

      for (const filename of domainFiles) {
        const filePath = path.join(DOMAINS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = JSON.parse(content) as OpenAPISpec;

        if (spec.components?.schemas) {
          totalSchemas += Object.keys(spec.components.schemas).length;
        }
      }

      expect(totalSchemas).toBeGreaterThanOrEqual(9000);
    });
  });

  describe('known domains', () => {
    // Real domain names in the enriched specs (WAF = network_security, LB = virtual, policy = network)
    const KNOWN_DOMAINS = ['dns', 'virtual', 'network_security', 'network', 'cdn', 'ddos'];

    it('should have all known domains present', () => {
      const domainFiles = fs.readdirSync(DOMAINS_DIR).filter((f) => f.endsWith('.json'));
      const foundDomains = new Set<string>();

      for (const filename of domainFiles) {
        const filePath = path.join(DOMAINS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = JSON.parse(content) as OpenAPISpec;

        const domain = spec.info?.['x-f5xc-cli-domain'];
        if (domain) {
          foundDomains.add(domain);
        }
      }

      for (const domain of KNOWN_DOMAINS) {
        expect(foundDomains.has(domain)).toBe(true);
      }
    });

    it('known domain files should have non-empty paths', () => {
      const KNOWN_FILES = ['dns.json', 'virtual.json', 'network_security.json', 'network.json'];

      for (const filename of KNOWN_FILES) {
        const filePath = path.join(DOMAINS_DIR, filename);
        expect(fs.existsSync(filePath)).toBe(true);

        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = JSON.parse(content) as OpenAPISpec;

        expect(spec.paths).toBeDefined();
        expect(Object.keys(spec.paths || {}).length).toBeGreaterThan(0);
      }
    });
  });
});
