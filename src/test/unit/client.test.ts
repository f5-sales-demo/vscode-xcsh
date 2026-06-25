// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { EventEmitter } from 'node:events';
import * as https from 'node:https';
import { TokenAuthProvider } from '../../api/auth/tokenAuth';
import { type ListOptions, XCSHClient } from '../../api/client';
import { ResourceCategory, type ResourceTypeInfo } from '../../api/resourceTypes';

jest.mock('node:https', () => ({ request: jest.fn() }));

describe('XCSHClient', () => {
  describe('buildListOptions', () => {
    it('should build list options from minimal resource type info', () => {
      const resourceType: ResourceTypeInfo = {
        apiPath: 'http_loadbalancers',
        displayName: 'HTTP Load Balancers',
        category: ResourceCategory.LoadBalancing,
        icon: 'globe',
        supportsCustomOps: false,
      };

      const options = XCSHClient.buildListOptions(resourceType);

      expect(options.apiBase).toBeUndefined();
      expect(options.customListPath).toBeUndefined();
      expect(options.listMethod).toBeUndefined();
      expect(options.tenantLevel).toBeUndefined();
      expect(options.listResponseField).toBeUndefined();
      expect(options.labelFilter).toBeUndefined();
    });

    it('should build list options with all resource type fields', () => {
      const resourceType: ResourceTypeInfo = {
        apiPath: 'active_alerts',
        displayName: 'Active Alerts',
        category: ResourceCategory.Observability,
        icon: 'alert',
        supportsCustomOps: false,
        apiBase: 'web',
        customListPath: '/api/web/namespaces/{namespace}/active_alerts',
        listMethod: 'POST',
        tenantLevel: true,
        listResponseField: 'alerts',
      };

      const options = XCSHClient.buildListOptions(resourceType);

      expect(options.apiBase).toBe('web');
      expect(options.customListPath).toBe('/api/web/namespaces/{namespace}/active_alerts');
      expect(options.listMethod).toBe('POST');
      expect(options.tenantLevel).toBe(true);
      expect(options.listResponseField).toBe('alerts');
    });

    it('should include label filter when provided', () => {
      const resourceType: ResourceTypeInfo = {
        apiPath: 'origin_pools',
        displayName: 'Origin Pools',
        category: ResourceCategory.LoadBalancing,
        icon: 'server',
        supportsCustomOps: false,
      };

      const options = XCSHClient.buildListOptions(resourceType, 'env=prod');

      expect(options.labelFilter).toBe('env=prod');
    });

    it('should handle undefined label filter', () => {
      const resourceType: ResourceTypeInfo = {
        apiPath: 'app_firewalls',
        displayName: 'App Firewalls',
        category: ResourceCategory.Security,
        icon: 'shield',
        supportsCustomOps: false,
      };

      const options = XCSHClient.buildListOptions(resourceType, undefined);

      expect(options.labelFilter).toBeUndefined();
    });

    it('should handle config api base', () => {
      const resourceType: ResourceTypeInfo = {
        apiPath: 'service_policys',
        displayName: 'Service Policies',
        category: ResourceCategory.Security,
        icon: 'shield',
        supportsCustomOps: false,
        apiBase: 'config',
      };

      const options = XCSHClient.buildListOptions(resourceType);

      expect(options.apiBase).toBe('config');
    });

    it('should handle web api base', () => {
      const resourceType: ResourceTypeInfo = {
        apiPath: 'namespaces',
        displayName: 'Namespaces',
        category: ResourceCategory.IAM,
        icon: 'folder',
        supportsCustomOps: false,
        apiBase: 'web',
      };

      const options = XCSHClient.buildListOptions(resourceType);

      expect(options.apiBase).toBe('web');
    });
  });
});

describe('ListOptions interface', () => {
  it('should allow all properties to be optional', () => {
    const options: ListOptions = {};
    expect(options.apiBase).toBeUndefined();
    expect(options.customListPath).toBeUndefined();
    expect(options.listMethod).toBeUndefined();
    expect(options.tenantLevel).toBeUndefined();
    expect(options.listResponseField).toBeUndefined();
    expect(options.labelFilter).toBeUndefined();
  });

  it('should allow GET list method', () => {
    const options: ListOptions = { listMethod: 'GET' };
    expect(options.listMethod).toBe('GET');
  });

  it('should allow POST list method', () => {
    const options: ListOptions = { listMethod: 'POST' };
    expect(options.listMethod).toBe('POST');
  });

  it('should allow config api base', () => {
    const options: ListOptions = { apiBase: 'config' };
    expect(options.apiBase).toBe('config');
  });

  it('should allow web api base', () => {
    const options: ListOptions = { apiBase: 'web' };
    expect(options.apiBase).toBe('web');
  });
});

describe('XCSHClient request URL host safety', () => {
  const httpsMock = https.request as unknown as jest.Mock;
  const auth = new TokenAuthProvider({
    apiUrl: 'https://tenant.console.ves.volterra.io/api',
    apiToken: 'tok-abc123def456',
  });

  // Capture the options handed to https.request, and drive a minimal 200 response so
  // the client's request promise resolves.
  function captureRequestOptions(): { options: https.RequestOptions | null } {
    const ref: { options: https.RequestOptions | null } = { options: null };
    httpsMock.mockImplementation((options: https.RequestOptions, cb: (res: EventEmitter) => void) => {
      ref.options = options;
      const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: {}, resume: () => {} });
      cb(res);
      process.nextTick(() => res.emit('end'));
      return Object.assign(new EventEmitter(), { write: () => {}, end: () => {}, destroy: () => {} });
    });
    return ref;
  }

  beforeEach(() => httpsMock.mockReset());

  // Regression: `//api/...` must NOT be parsed as a protocol-relative authority that
  // collapses the host to the bare label `api` (the TLS altnames-mismatch bug).
  it('does not collapse the host to a bare label for a protocol-relative // path', async () => {
    const ref = captureRequestOptions();
    const client = new XCSHClient('https://tenant.console.ves.volterra.io/api', auth);
    await client.customRequest('//api/config/namespaces/system/x');
    expect(ref.options?.hostname).toBe('tenant.console.ves.volterra.io');
    expect(ref.options?.hostname).not.toBe('api');
  });

  it('preserves the host and pathname for a normal single-slash path', async () => {
    const ref = captureRequestOptions();
    const client = new XCSHClient('https://tenant.console.ves.volterra.io/api', auth);
    await client.customRequest('/api/config/namespaces/system/x');
    expect(ref.options?.hostname).toBe('tenant.console.ves.volterra.io');
    expect(ref.options?.path).toBe('/api/config/namespaces/system/x');
  });
});
