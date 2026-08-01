// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { buildDomainDocumentationUrls } from '../../../scripts/generate-doc-urls';
import type { ParsedSpecInfo } from '../../../scripts/generators/spec-parser';

function parsedSpec(overrides: Partial<ParsedSpecInfo> = {}): ParsedSpecInfo {
  return {
    apiBase: 'config',
    apiPath: 'http_loadbalancers',
    description: 'HTTP load balancer',
    displayName: 'HTTP Load Balancers',
    domain: 'virtual',
    fullApiPath: '/api/config/namespaces/{namespace}/http_loadbalancers',
    namespaceScoped: true,
    resourceKey: 'http_loadbalancer',
    schemaFile: 'virtual.json',
    schemaId: 'ves.io.schema.views.http_loadbalancer',
    ...overrides,
  };
}

describe('documentation URL generation from enriched domains', () => {
  it('maps both runtime resource-key forms to the domain documentation', () => {
    const urls = buildDomainDocumentationUrls([parsedSpec()]);
    const expected = 'https://f5-sales-demo.github.io/api-specs-enriched/api-reference/virtual/';
    expect(urls.http_loadbalancer).toBe(expected);
    expect(urls.http_loadbalancers).toBe(expected);
  });

  it('preserves an explicit enriched documentation URL', () => {
    const documentationUrl = 'https://docs.example.test/exact-resource/';
    const urls = buildDomainDocumentationUrls([parsedSpec({ documentationUrl })]);
    expect(urls.http_loadbalancer).toBe(documentationUrl);
    expect(urls.http_loadbalancers).toBe(documentationUrl);
  });

  it('does not invent a URL when the parsed resource has no domain', () => {
    expect(buildDomainDocumentationUrls([parsedSpec({ domain: undefined })])).toEqual({});
  });
});
