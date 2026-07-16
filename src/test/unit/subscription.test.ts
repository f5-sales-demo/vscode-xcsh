// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { XCSHClient } from '../../api/client';
import { getQuotaForResourceType, getQuotaUsage } from '../../api/subscription';

// Fixture modelled on the verified live /quota/usage response shape:
//   objects/resources: { limit:{maximum}, usage:{current}, display_name, description }
//   apis:              { limit:null, usage:null, api_limit:{rate,burst,unit}, display_name }
// (synthetic values — no live data/credentials)
const QUOTA_RESPONSE = {
  objects: {
    namespace_role: { limit: { maximum: 500 }, usage: { current: 2387 }, display_name: 'Namespace Role' },
    virtual_host: { limit: { maximum: 500 }, usage: { current: 446 }, display_name: 'Virtual Host' },
    dns_load_balancer: { limit: { maximum: 50 }, usage: { current: 50 }, display_name: 'DNS Load Balancer' },
    unlimited_thing: { limit: { maximum: -1 }, usage: { current: 5 }, display_name: 'Unlimited Thing' },
    broken_null: null,
    // usage not tracked by the API (real limit, usage.current == -1)
    data_type: { limit: { maximum: 50 }, usage: { current: -1 }, display_name: 'Data Type' },
    // no display_name -> title-cased key fallback
    known_label_key: { limit: { maximum: 10 }, usage: { current: 3 } },
  },
  resources: {
    active_customer_support_tickets: {
      limit: { maximum: 50 },
      usage: { current: 13 },
      display_name: 'Active Customer Support Tickets',
    },
  },
  apis: {
    'ves.io.schema.ai_assistant.SahayaAPI.AIAssistantQuery': {
      limit: null,
      usage: null,
      api_limit: { rate: 60, burst: 15, unit: 'per-minute' },
      display_name: 'AI Assistant Query',
    },
    no_rate_limit: { api_limit: null, display_name: 'No Rate Limit' },
  },
};

function mockClient(response: unknown): XCSHClient {
  return { customRequest: jest.fn().mockResolvedValue(response) } as unknown as XCSHClient;
}

describe('getQuotaUsage', () => {
  it('parses the current objects map, dropping unlimited (-1) and null entries', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    const keys = usage.objects.map((o) => o.key);
    expect(keys).not.toContain('unlimited_thing'); // -1 limit dropped
    expect(keys).not.toContain('broken_null'); // null dropped
    expect(keys.sort()).toEqual([
      'data_type',
      'dns_load_balancer',
      'known_label_key',
      'namespace_role',
      'virtual_host',
    ]);
  });

  it('flags untracked usage (usage.current == -1) without a negative percentage', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    const dt = usage.objects.find((o) => o.key === 'data_type');
    expect(dt).toMatchObject({ usageKnown: false, usage: 0, limit: 50, percentUsed: 0, overLimit: false });
  });

  it('reports genuine over-limit usage faithfully (unclamped percent + overLimit flag)', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    const ns = usage.objects.find((o) => o.key === 'namespace_role');
    expect(ns).toMatchObject({ usage: 2387, limit: 500, percentUsed: 477, overLimit: true });
    const vh = usage.objects.find((o) => o.key === 'virtual_host');
    expect(vh).toMatchObject({ percentUsed: 89, overLimit: false });
  });

  it('sorts objects by percentUsed descending', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    const pcts = usage.objects.map((o) => o.percentUsed);
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a));
    expect(usage.objects[0]?.key).toBe('namespace_role');
  });

  it('uses display_name, falling back to a title-cased key', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    expect(usage.objects.find((o) => o.key === 'namespace_role')?.displayName).toBe('Namespace Role');
    expect(usage.objects.find((o) => o.key === 'known_label_key')?.displayName).toBe('Known Label Key');
  });

  it('parses the resources map', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    expect(usage.resources).toHaveLength(1);
    expect(usage.resources[0]).toMatchObject({
      key: 'active_customer_support_tickets',
      usage: 13,
      limit: 50,
      percentUsed: 26,
      overLimit: false,
    });
  });

  it('parses apis as rate limits (rate/burst/unit, no usage), dropping entries without api_limit', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    expect(usage.apis).toHaveLength(1);
    expect(usage.apis[0]).toEqual({
      key: 'ves.io.schema.ai_assistant.SahayaAPI.AIAssistantQuery',
      displayName: 'AI Assistant Query',
      description: undefined,
      rate: 60,
      burst: 15,
      unit: 'per-minute',
    });
  });

  it('throws when the response has none of the current maps', async () => {
    await expect(getQuotaUsage(mockClient({ quota_usage: {} }))).rejects.toThrow(/objects\/resources\/apis/);
  });

  it('critical count (percentUsed >= 80) reflects object+resource quotas', async () => {
    const usage = await getQuotaUsage(mockClient(QUOTA_RESPONSE));
    const critical = [...usage.objects, ...usage.resources].filter((i) => i.percentUsed >= 80);
    // namespace_role (477), dns_load_balancer (100), virtual_host (89)
    expect(critical.map((c) => c.key).sort()).toEqual(['dns_load_balancer', 'namespace_role', 'virtual_host']);
  });
});

describe('getQuotaForResourceType', () => {
  it('maps a resource-type key to its object quota (http_loadbalancers -> virtual_host)', async () => {
    const item = await getQuotaForResourceType(mockClient(QUOTA_RESPONSE), 'http_loadbalancers');
    expect(item?.key).toBe('virtual_host');
    expect(item?.displayName).toBe('Virtual Host');
  });

  it('returns undefined when no quota matches', async () => {
    const item = await getQuotaForResourceType(mockClient(QUOTA_RESPONSE), 'nonexistent_type_xyz');
    expect(item).toBeUndefined();
  });
});
