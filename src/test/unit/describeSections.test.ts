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

describe('App Firewall describe sections', () => {
  const sections = buildSections(
    'app_firewall',
    { name: 'acme-app-fw' },
    {},
    { blocking: {}, detection_settings: { signature_selection_setting: {} }, enable_ai_enhancements: {} },
  );
  const titles = sections.map((s) => s.title);

  it('renders the console section titles', () => {
    for (const t of ['Metadata', 'Enforcement Mode', 'Security Policy Settings', 'Advanced configuration']) {
      expect(titles).toContain(t);
    }
  });

  it('surfaces the enforcement mode choice', () => {
    const enforcement = findSection(sections, 'Enforcement Mode');
    const hasContent = (enforcement?.fields.length ?? 0) > 0 || (enforcement?.subGroups?.length ?? 0) > 0;
    expect(hasContent).toBe(true);
  });
});

describe('Service Policy describe sections', () => {
  const sections = buildSections(
    'service_policy',
    { name: 'geo-block', description: 'block by geo' },
    {},
    { any_server: {}, rule_list: { rules: [{ name: 'r1' }] } },
  );
  const titles = sections.map((s) => s.title);

  it('renders the console section titles', () => {
    for (const t of ['Metadata', 'Servers', 'Rules']) {
      expect(titles).toContain(t);
    }
  });

  it('Servers section reflects the server-selection choice', () => {
    const servers = findSection(sections, 'Servers');
    const hasContent = (servers?.fields.length ?? 0) > 0 || (servers?.subGroups?.length ?? 0) > 0;
    expect(hasContent).toBe(true);
  });
});

describe('TCP Load Balancer describe sections', () => {
  const sections = buildSections(
    'tcp_loadbalancer',
    { name: 'acme-tcp-lb' },
    {},
    {
      domains: ['tcp.acme.example.com'],
      listen_port: 8080,
      no_sni: {},
      origin_pools_weights: [{ pool: { name: 'tcp-pool' }, weight: 1 }],
      advertise_on_public: {},
      tcp: {},
      service_policies_from_namespace: {},
      idle_timeout: 30000,
      host_name: 'ves-io-tcp.ac.vh.ves.io',
      dns_info: [{ ip_address: '2.2.2.2' }],
      auto_cert_info: { auto_cert_state: 'AutoCertEnabled' },
      cert_state: 'AutoCertPresent',
    },
  );
  const titles = sections.map((s) => s.title);

  it('renders the console section titles including status sections', () => {
    for (const t of [
      'Metadata',
      'Basic Configuration',
      'Load Balancing Control',
      'Service Policies',
      'Advanced Configuration',
      'Host Name',
      'DNS Information',
      'Auto Cert State',
      'Cert State',
    ]) {
      expect(titles).toContain(t);
    }
  });

  it('Basic Configuration shows the domain and Origins by pool name', () => {
    const basic = findSection(sections, 'Basic Configuration');
    expect(basic?.fields.find((f) => f.key === 'Domains')?.value).toContain('tcp.acme.example.com');
    const poolNames = (basic?.subGroups ?? []).flatMap((sg) => sg.fields.map((f) => f.key));
    expect(poolNames).toContain('tcp-pool');
  });
});

describe('CDN Load Balancer describe sections', () => {
  const sections = buildSections(
    'cdn_loadbalancer',
    { name: 'acme-cdn' },
    {},
    {
      domains: ['cdn.acme.example.com'],
      https_auto_cert: {},
      origin_pool: { public_name: { dns_name: 'origin.acme.example.com' } },
      default_cache_action: { cache_ttl_mode: 'UseTTLfromOrigin' },
      app_firewall: { name: 'acme-waf' },
      host_name: 'ves-io-cdn.ac.vh.ves.io',
      state: 'VIRTUAL_HOST_READY',
    },
  );
  const titles = sections.map((s) => s.title);

  it('renders the console section titles', () => {
    for (const t of [
      'Metadata',
      'Basic Configuration',
      'CDN Origin Pool',
      'Caching Policies',
      'Web Application Firewall',
      'API Protection',
      'DoS Protection',
      'Common Security Controls',
      'Other Settings',
      'Host Name',
    ]) {
      expect(titles).toContain(t);
    }
  });

  it('Basic Configuration shows the domain', () => {
    const basic = findSection(sections, 'Basic Configuration');
    expect(basic?.fields.find((f) => f.key === 'Domains')?.value).toContain('cdn.acme.example.com');
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
