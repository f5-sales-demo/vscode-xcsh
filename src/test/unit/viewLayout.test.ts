// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { GENERATED_VIEW_LAYOUTS, type ViewFieldNode } from '../../generated/viewLayouts';
import { VIEW_SECTION_MANIFESTS } from '../../providers/viewSectionManifests';

function topLevelKeys(resourceKey: string): Set<string> {
  const layout = GENERATED_VIEW_LAYOUTS[resourceKey];
  return new Set((layout?.fields ?? []).map((f: ViewFieldNode) => f.key));
}

describe('generated view layouts', () => {
  it('includes the HTTP LB read-only status fields from GetSpecType', () => {
    const keys = topLevelKeys('http_loadbalancer');
    // These live only on GetSpecType (not CreateSpecType) — proves Get-first selection.
    for (const k of ['domains', 'default_route_pools', 'dns_info', 'host_name', 'auto_cert_info', 'cert_state']) {
      expect(keys.has(k)).toBe(true);
    }
  });

  it('captures x-displayname labels where the spec provides them', () => {
    const layout = GENERATED_VIEW_LAYOUTS['http_loadbalancer'];
    const byKey = new Map((layout?.fields ?? []).map((f) => [f.key, f]));
    expect(byKey.get('default_route_pools')?.label).toBe('Origin Pools');
    expect(byKey.get('dns_info')?.label).toBe('DNS Information');
    expect(byKey.get('host_name')?.label).toBe('Host Name');
  });

  it('generated layouts for a broad set of resource types', () => {
    // Sanity: the generator produced layouts for many resources, not just a couple.
    expect(Object.keys(GENERATED_VIEW_LAYOUTS).length).toBeGreaterThan(100);
  });
});

describe('section manifests resolve against generated layouts', () => {
  for (const [resourceKey, manifest] of Object.entries(VIEW_SECTION_MANIFESTS)) {
    describe(resourceKey, () => {
      const keys = topLevelKeys(resourceKey);

      it('has a generated layout', () => {
        expect(keys.size).toBeGreaterThan(0);
      });

      it('every manifest section has a non-empty title and id', () => {
        for (const section of manifest.sections) {
          expect(section.title.trim().length).toBeGreaterThan(0);
          expect(section.id.trim().length).toBeGreaterThan(0);
        }
      });

      it('every manifest key resolves to a real top-level layout field (no dangling keys)', () => {
        const dangling: string[] = [];
        for (const section of manifest.sections) {
          for (const key of section.keys) {
            if (!keys.has(key)) {
              dangling.push(`${section.id}:${key}`);
            }
          }
        }
        expect(dangling).toEqual([]);
      });

      it('label overrides reference real top-level layout fields', () => {
        for (const key of Object.keys(manifest.labelOverrides ?? {})) {
          expect(keys.has(key)).toBe(true);
        }
      });
    });
  }
});
