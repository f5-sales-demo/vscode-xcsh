// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { getAddonSchemaInfo } from '../../api/addonCatalog';
import { RESOURCE_TYPES } from '../../api/resourceTypes';

describe('addonCatalog.getAddonSchemaInfo', () => {
  it('maps Bot Defense to its policy resources, derived API base, and known cloud', () => {
    const info = getAddonSchemaInfo({ name: 'f5xc_bot_defense_advanced', displayName: 'Bot Defense' });
    const keys = info.resources.map((r) => r.key);
    expect(keys).toContain('bot_network_policy');
    expect(keys).toContain('bot_detection_rule');
    expect(info.apiBases).toEqual(['/api/shape/bot']);
    expect(info.cloud).toBe('AWS, GCP');
  });

  it('maps Synthetic Monitoring to the v1 monitors with the observability service segment', () => {
    const info = getAddonSchemaInfo({ name: 'f5xc_synthetic_monitoring', displayName: 'Synthetic Monitoring' });
    expect(info.resources.map((r) => r.key).sort()).toEqual(['v1_dns_monitor', 'v1_http_monitor']);
    expect(info.apiBases).toEqual(['/api/observability/synthetic_monitor']);
    expect(info.cloud).toBeUndefined();
  });

  it('marks DNS as AWS-hosted', () => {
    const info = getAddonSchemaInfo({ name: 'f5xc_dns', displayName: 'DNS' });
    expect(info.cloud).toBe('AWS');
    expect(info.resources.length).toBeGreaterThan(0);
  });

  it('returns empty info (no fabrication) for an unmapped add-on', () => {
    const info = getAddonSchemaInfo({ name: 'f5xc_delegated_access', displayName: 'Delegated Access' });
    expect(info.resources).toEqual([]);
    expect(info.apiBases).toEqual([]);
    expect(info.cloud).toBeUndefined();
  });

  it('only ever references resources that exist in the registry', () => {
    const probes = [
      { name: 'bot', displayName: 'Bot Defense' },
      { name: 'csd', displayName: 'Client-Side Defense' },
      { name: 'nginx', displayName: 'NGINX One Console' },
      { name: 'dns', displayName: 'DNS' },
      { name: 'waap', displayName: 'Web App & API Protection' },
    ];
    for (const p of probes) {
      for (const r of getAddonSchemaInfo(p).resources) {
        expect(RESOURCE_TYPES[r.key]).toBeDefined();
        expect(r.displayName).toBe(RESOURCE_TYPES[r.key]?.displayName);
      }
    }
  });
});
