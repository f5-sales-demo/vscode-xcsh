// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for API path construction via F5XCClient.buildListOptions.
 *
 * buildListOptions is a static helper that converts a ResourceTypeInfo
 * into the ListOptions used by listWithOptions(). These tests verify
 * every resource type in the registry produces valid, non-throwing output.
 */

import { F5XCClient } from '../../api/client';
import { RESOURCE_TYPES } from '../../api/resourceTypes';

describe('API path building — F5XCClient.buildListOptions', () => {
  it('returns apiBase "config" for http_loadbalancer (default)', () => {
    const info = RESOURCE_TYPES.http_loadbalancer;
    expect(info).toBeDefined();
    if (!info) {
      return;
    }
    const opts = F5XCClient.buildListOptions(info);
    expect(opts.apiBase === undefined || opts.apiBase === 'config').toBe(true);
  });

  it('sets serviceSegment when the resource defines one', () => {
    // Find a resource that has a serviceSegment (if any)
    const withSegment = Object.values(RESOURCE_TYPES).find((r) => r.serviceSegment);
    if (withSegment) {
      const opts = F5XCClient.buildListOptions(withSegment);
      expect(opts.serviceSegment).toBe(withSegment.serviceSegment);
    }
  });

  it('does NOT throw for any resource type in RESOURCE_TYPES', () => {
    for (const [_key, info] of Object.entries(RESOURCE_TYPES)) {
      expect(() => F5XCClient.buildListOptions(info)).not.toThrow();
    }
  });

  it('all resource types resolve to a non-empty apiBase or default (config)', () => {
    for (const [_key, info] of Object.entries(RESOURCE_TYPES)) {
      const opts = F5XCClient.buildListOptions(info);
      // apiBase is either undefined (→ default "config") or a non-empty string
      if (opts.apiBase !== undefined) {
        expect(typeof opts.apiBase).toBe('string');
        expect(opts.apiBase.length).toBeGreaterThan(0);
      }
    }
  });

  it('there are more than 3 distinct API bases across all types', () => {
    const bases = new Set<string>();
    for (const info of Object.values(RESOURCE_TYPES)) {
      bases.add(info.apiBase || 'config');
    }
    expect(bases.size).toBeGreaterThan(3);
  });

  it('"config" is the most common API base (>50%)', () => {
    const total = Object.keys(RESOURCE_TYPES).length;
    let configCount = 0;
    for (const info of Object.values(RESOURCE_TYPES)) {
      if (!info.apiBase || info.apiBase === 'config') {
        configCount++;
      }
    }
    expect(configCount / total).toBeGreaterThan(0.5);
  });

  it('preserves customListPath when present', () => {
    const withCustom = Object.values(RESOURCE_TYPES).find((r) => r.customListPath);
    if (withCustom) {
      const opts = F5XCClient.buildListOptions(withCustom);
      expect(opts.customListPath).toBe(withCustom.customListPath);
    }
  });

  it('preserves listMethod when present', () => {
    const withMethod = Object.values(RESOURCE_TYPES).find((r) => r.listMethod);
    if (withMethod) {
      const opts = F5XCClient.buildListOptions(withMethod);
      expect(opts.listMethod).toBe(withMethod.listMethod);
    }
  });

  it('passes through labelFilter argument', () => {
    const info = RESOURCE_TYPES.http_loadbalancer;
    expect(info).toBeDefined();
    if (!info) {
      return;
    }
    const opts = F5XCClient.buildListOptions(info, 'env=prod');
    expect(opts.labelFilter).toBe('env=prod');
  });
});
