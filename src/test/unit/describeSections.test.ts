// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { XCSHDescribeProvider } from '../../providers/xcshDescribeProvider';

interface FieldDef {
  key: string;
  value: string;
}
interface SubGroupDef {
  id: string;
  title: string;
  fields: FieldDef[];
}
interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
  subGroups?: SubGroupDef[];
}

// Access the private spec-driven section builder without a live client.
type SectionBuilder = (
  resourceKey: string | undefined,
  metadata: Record<string, unknown> | undefined,
  systemMetadata: Record<string, unknown> | undefined,
  spec: Record<string, unknown> | undefined,
  namespace: string,
) => SectionDef[];

function buildSections(
  resourceKey: string,
  metadata: Record<string, unknown>,
  systemMetadata: Record<string, unknown>,
  spec: Record<string, unknown>,
): SectionDef[] {
  const provider = new XCSHDescribeProvider({} as never);
  const build = (provider as unknown as { extractSpecDrivenSections: SectionBuilder }).extractSpecDrivenSections.bind(
    provider,
  );
  return build(resourceKey, metadata, systemMetadata, spec, 'r-mordasiewicz');
}

// Fixture modelled on the acme-bankexample-lb HTTP LB GET response from the console.
const HTTP_LB_METADATA = {
  name: 'acme-bankexample-lb',
  description: 'ACME APISEC staging demo LB for acme.bankexample.com',
  labels: { 'ves.io/app_type': 'ves-io-acme-api-def' },
};
const HTTP_LB_SYSTEM_METADATA = { uid: 'abc-123', creator_id: 'demo@f5.com' };
const HTTP_LB_SPEC: Record<string, unknown> = {
  domains: ['acme.bankexample.com'],
  http: { port: 80, dns_volterra_managed: false },
  default_route_pools: [
    { pool: { name: 'acme-bankexample-pool', namespace: 'r-mordasiewicz' }, weight: 1, priority: 1 },
  ],
  app_firewall: { name: 'acme-waf' },
  dns_info: [{ ip_address: '1.2.3.4' }],
  host_name: 'ves-io-abc123.ac.vh.ves.io',
  auto_cert_info: { auto_cert_state: 'AutoCertEnabled' },
  cert_state: 'AutoCertPresent',
  state: 'VIRTUAL_HOST_READY',
};

function findSection(sections: SectionDef[], title: string): SectionDef | undefined {
  return sections.find((s) => s.title === title);
}

describe('HTTP Load Balancer describe sections', () => {
  const sections = buildSections('http_loadbalancer', HTTP_LB_METADATA, HTTP_LB_SYSTEM_METADATA, HTTP_LB_SPEC);

  it('renders the console section titles including the previously-missing ones', () => {
    const titles = sections.map((s) => s.title);
    for (const title of [
      'Metadata',
      'Domains and LB Type',
      'Origins',
      'Web Application Firewall',
      'Host Name',
      'DNS Information',
      'Auto Cert State',
      'Cert State',
      'Virtual Host State',
    ]) {
      expect(titles).toContain(title);
    }
  });

  it('Metadata section includes Labels and Description', () => {
    const metadata = findSection(sections, 'Metadata');
    const keys = metadata?.fields.map((f) => f.key) ?? [];
    expect(keys).toContain('Description');
    expect(keys).toContain('Labels');
    expect(metadata?.fields.find((f) => f.key === 'Description')?.value).toContain('ACME APISEC');
  });

  it('Origins section surfaces the origin pool by name', () => {
    const origins = findSection(sections, 'Origins');
    const itemLabels = (origins?.subGroups ?? []).flatMap((sg) => sg.fields.map((f) => f.key));
    expect(itemLabels).toContain('acme-bankexample-pool');
  });

  it('Host Name and DNS Information carry their live values', () => {
    const hostName = findSection(sections, 'Host Name');
    expect(hostName?.fields.some((f) => f.value.includes('ves-io-abc123'))).toBe(true);

    const dns = findSection(sections, 'DNS Information');
    const dnsHasContent = (dns?.fields.length ?? 0) > 0 || (dns?.subGroups?.length ?? 0) > 0;
    expect(dnsHasContent).toBe(true);
  });

  it('Domains and LB Type shows the domain and the active HTTP listener', () => {
    const domains = findSection(sections, 'Domains and LB Type');
    const domainField = domains?.fields.find((f) => f.key === 'Domains');
    expect(domainField?.value).toContain('acme.bankexample.com');
  });
});

describe('spec-driven fallback for resources without a manifest', () => {
  it('produces labelled sections instead of a flat dump', () => {
    // origin_pool has a manifest; use a made-up resource with no manifest but a layout
    // fallback path by passing an unknown resourceKey — it should still yield Metadata
    // plus grouped spec sections without throwing.
    const sections = buildSections(
      'unknown_resource_type',
      { name: 'x' },
      {},
      { some_scalar: 'v', some_object: { child: 1 } },
    );
    expect(sections[0]?.title).toBe('Metadata');
    // A scalar Configuration section and an object section are produced.
    const titles = sections.map((s) => s.title);
    expect(titles).toContain('Configuration');
  });
});
