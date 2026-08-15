// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/** Contract-driven resource generation coverage for issue #1105. */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadResourceCoverage,
  parseAllDomainFiles,
  type ResourceCoverageMap,
} from '../../../scripts/generators/spec-parser';

function writeJson(directory: string, filename: string, value: unknown): string {
  const output = path.join(directory, filename);
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
  return output;
}

function coverage(resources: ResourceCoverageMap['resources']): ResourceCoverageMap {
  return {
    version: '1.2.3',
    contractVersion: 1,
    resources,
  };
}

describe('resource coverage contract loading', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-resource-coverage-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rejects a missing artifact', () => {
    expect(() => loadResourceCoverage(path.join(directory, 'resource_coverage.json'), '1.2.3')).toThrow(
      /Required resource_coverage\.json not found/,
    );
  });

  it('rejects malformed JSON', () => {
    const artifact = path.join(directory, 'resource_coverage.json');
    fs.writeFileSync(artifact, '{');
    expect(() => loadResourceCoverage(artifact, '1.2.3')).toThrow(/Failed to parse resource_coverage\.json/);
  });

  it('rejects a version mismatch', () => {
    const artifact = writeJson(directory, 'resource_coverage.json', coverage({}));
    expect(() => loadResourceCoverage(artifact, '9.9.9')).toThrow(/version 1\.2\.3 does not match 9\.9\.9/);
  });

  it('rejects malformed dispositions and exclusion reasons', () => {
    const artifact = writeJson(directory, 'resource_coverage.json', {
      version: '1.2.3',
      contract_version: 1,
      resources: { widget: { disposition: 'excluded', reason: 'guess' } },
    });
    expect(() => loadResourceCoverage(artifact, '1.2.3')).toThrow(/invalid exclusion reason/);
  });

  it('rejects non-collection paths and mismatched create identities', () => {
    const badPath = writeJson(directory, 'resource_coverage.json', {
      version: '1.2.3',
      contract_version: 1,
      resources: {
        widget: {
          disposition: 'generated',
          path: '/api/config/namespaces/{namespace}/widgets/{name}/activate',
          operation_id: 'ves.io.schema.widget.API.Create',
        },
      },
    });
    expect(() => loadResourceCoverage(badPath, '1.2.3')).toThrow(/must declare path and operation_id/);

    const badIdentity = writeJson(directory, 'resource_coverage.json', {
      version: '1.2.3',
      contract_version: 1,
      resources: {
        widget: {
          disposition: 'generated',
          path: '/api/config/namespaces/{namespace}/widgets',
          operation_id: 'ves.io.schema.gadget.API.Create',
        },
      },
    });
    expect(() => loadResourceCoverage(badIdentity, '1.2.3')).toThrow(/mismatched operation identity/);
  });
});

describe('contract-driven domain parsing', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xcsh-contract-parser-'));
    writeJson(directory, 'domain.json', {
      openapi: '3.0.3',
      info: { version: '1.2.3', 'x-f5xc-cli-domain': 'test' },
      paths: {
        '/api/config/namespaces/{metadata.namespace}/widgets': {
          post: { operationId: 'ves.io.schema.views.widget.API.Create' },
        },
        '/api/config/namespaces/{namespace}/widgets/{name}/activate': {
          post: { operationId: 'ves.io.schema.widget.CustomAPI.Activate' },
        },
        '/api/data/namespaces/{namespace}/widgets/aggregation': {
          post: { operationId: 'ves.io.schema.widget.CustomAPI.Aggregate' },
        },
      },
      components: { schemas: {} },
    });
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('generates only resources marked generated and never action or aggregate routes', () => {
    const contract = coverage({
      widget: {
        disposition: 'generated',
        path: '/api/config/namespaces/{metadata.namespace}/widgets',
        operationId: 'ves.io.schema.views.widget.API.Create',
      },
      legacy: { disposition: 'excluded', reason: 'no_canonical_create' },
    });

    const parsed = parseAllDomainFiles(directory, contract);

    expect(parsed.map((resource) => resource.resourceKey)).toEqual(['widget']);
    expect(parsed[0]?.apiPath).toBe('widgets');
  });

  it('fails when a generated contract path is stale or unknown', () => {
    const contract = coverage({
      widget: {
        disposition: 'generated',
        path: '/api/config/namespaces/{metadata.namespace}/missing',
        operationId: 'ves.io.schema.views.widget.API.Create',
      },
    });

    expect(() => parseAllDomainFiles(directory, contract)).toThrow(/stale coverage path for canonical resource widget/);
  });

  it('fails when a new canonical create is not classified by the contract', () => {
    expect(() => parseAllDomainFiles(directory, coverage({}))).toThrow(/unclassified canonical resource widget/);
  });

  it('fails when the operation identity at a generated path changes', () => {
    const contract = coverage({
      widget: {
        disposition: 'generated',
        path: '/api/config/namespaces/{metadata.namespace}/widgets',
        operationId: 'ves.io.schema.widget.API.Create',
      },
    });

    expect(() => parseAllDomainFiles(directory, contract)).toThrow(/operation identity mismatch/);
  });

  it('requires every manual override path to resolve to a GET collection route', () => {
    writeJson(directory, 'manual.json', {
      openapi: '3.0.3',
      info: { version: '1.2.3', 'x-f5xc-cli-domain': 'manual' },
      paths: {
        '/api/config/namespaces/{namespace}/reports': {
          get: { operationId: 'ves.io.schema.report.API.List' },
        },
      },
      components: { schemas: {} },
    });
    const manual = coverage({
      widget: {
        disposition: 'generated',
        path: '/api/config/namespaces/{metadata.namespace}/widgets',
        operationId: 'ves.io.schema.views.widget.API.Create',
      },
      report: {
        disposition: 'manual',
        path: '/api/config/namespaces/{namespace}/reports',
      },
    });

    expect(parseAllDomainFiles(directory, manual).map((resource) => resource.resourceKey)).toEqual(['widget']);

    manual.resources.report = {
      disposition: 'manual',
      path: '/api/config/namespaces/{namespace}/missing_reports',
    };
    expect(() => parseAllDomainFiles(directory, manual)).toThrow(/stale manual coverage paths.*report/);
  });
});
