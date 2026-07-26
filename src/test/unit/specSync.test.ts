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
 * Smoke-test floors for the synced spec corpus.
 *
 * These catch a truncated or empty sync. They deliberately do NOT pin the size of
 * F5's published API surface, because that surface moves — sometimes sharply. On
 * 2026-07-24 F5's published bundle went from ~520 specs to 283 and retired APM
 * entirely, taking the schema total from 9018 to 8540. The previous floor of 9000
 * sat 0.2% under the then-current total, so an ordinary upstream change became a
 * repo-wide CI outage that blocked every pull request and read like data
 * corruption. Generous floors keep the smoke test useful without that fragility:
 * losing a third of the corpus is a real failure, losing 5% is Tuesday.
 *
 * `specs:sync` fetches the latest upstream release at test time, so these are
 * asserted against live data, not a committed fixture.
 *
 * Observed at api-specs-enriched v2.1.196: 8540 schemas, 1676 paths.
 */
const MIN_TOTAL_PATHS = 1200;
const MIN_TOTAL_SCHEMAS = 6000;

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
    /** Total across every domain file of whatever `count` measures in one spec. */
    function sumOverDomains(count: (spec: OpenAPISpec) => number): number {
      return fs
        .readdirSync(DOMAINS_DIR)
        .filter((f) => f.endsWith('.json'))
        .reduce((total, filename) => {
          const content = fs.readFileSync(path.join(DOMAINS_DIR, filename), 'utf-8');
          return total + count(JSON.parse(content) as OpenAPISpec);
        }, 0);
    }

    it(`should have at least ${MIN_TOTAL_PATHS} total API paths across all domain files`, () => {
      expect(sumOverDomains((spec) => Object.keys(spec.paths ?? {}).length)).toBeGreaterThanOrEqual(MIN_TOTAL_PATHS);
    });

    it(`should have at least ${MIN_TOTAL_SCHEMAS} total schemas across all domain files`, () => {
      expect(sumOverDomains((spec) => Object.keys(spec.components?.schemas ?? {}).length)).toBeGreaterThanOrEqual(
        MIN_TOTAL_SCHEMAS,
      );
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

describe('Spec version single-source-of-truth', () => {
  const PACKAGE_JSON = path.resolve(__dirname, '../../../package.json');
  const OPENAPI_JSON = path.join(SPEC_ROOT, 'openapi.json');

  it('package.json must not hand-maintain a spec-version marker', () => {
    // Regression guard: `x-upstream-specs-version` was a dead, hand-maintained
    // field that drifted from the real (auto-synced) spec version and produced
    // recurring false "we are pinned to an old spec" alarms. The bundled
    // openapi.json info.version is the single source of truth.
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8')) as Record<string, unknown>;
    expect(pkg['x-upstream-specs-version']).toBeUndefined();

    const handMaintainedSpecVersionKeys = Object.keys(pkg).filter((k) =>
      /upstream.*spec.*version|spec.*version/i.test(k),
    );
    expect(handMaintainedSpecVersionKeys).toEqual([]);
  });

  it('the extension version must be derived from the bundled spec version', () => {
    // scripts/version.ts builds the semver from openapi.json info.version, so a
    // freshly-synced build always reflects the latest upstream spec. This asserts
    // the two stay coupled (major segment of the extension version tracks the
    // upstream major), catching a decoupled/pinned version marker sneaking back.
    if (!fs.existsSync(OPENAPI_JSON)) {
      return; // specs not synced in this environment; covered by CI where they are
    }
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8')) as { version: string };
    const spec = JSON.parse(fs.readFileSync(OPENAPI_JSON, 'utf-8')) as { info?: { version?: string } };
    const upstreamMajor = (spec.info?.version ?? '').split('.')[0];
    const pkgMajor = pkg.version.split('.')[0];
    expect(upstreamMajor).not.toEqual('');
    expect(pkgMajor).toEqual(upstreamMajor);
  });
});
