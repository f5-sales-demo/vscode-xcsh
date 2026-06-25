// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

// Mock vscode before any imports
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    })),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn().mockReturnValue('info'),
    })),
  },
}));

// Mock the shared package
const mockResourceClient = {
  get: jest.fn(),
  exportOne: jest.fn(),
  apply: jest.fn(),
  create: jest.fn(),
  diff: jest.fn(),
  delete: jest.fn(),
};

const mockKindResolver = {
  resolveKind: jest.fn().mockReturnValue({
    kind: 'http_loadbalancer',
    domain: 'networking',
    paths: {
      list: '/api/config/namespaces/{namespace}/http_loadbalancers',
      get: '/api/config/namespaces/{namespace}/http_loadbalancers/{name}',
      create: '/api/config/namespaces/{namespace}/http_loadbalancers',
      update: '/api/config/namespaces/{namespace}/http_loadbalancers/{name}',
      delete: '/api/config/namespaces/{namespace}/http_loadbalancers/{name}',
    },
  }),
  getAllKnownKinds: jest.fn().mockReturnValue(['http_loadbalancer']),
  getKindsWithApiPaths: jest.fn().mockReturnValue(['http_loadbalancer']),
};

jest.mock(
  '@f5xc-salesdemos/pi-resource-management',
  () => ({
    ResourceClient: jest.fn().mockImplementation(() => mockResourceClient),
    toManifest: jest.fn((resource: Record<string, unknown>, kind: string) => ({
      kind,
      metadata: { name: (resource.metadata as Record<string, unknown>)?.name ?? 'test' },
      spec: resource.spec ?? {},
    })),
    toManifestList: jest.fn(),
    formatManifestOutput: jest.fn((manifest: Record<string, unknown>) => JSON.stringify(manifest, null, 2)),
    parseManifests: jest.fn((objects: Record<string, unknown>[]) => {
      return objects.map((obj) => ({
        kind: obj.kind,
        metadata: obj.metadata,
        spec: obj.spec ?? {},
        rawObject: obj,
      }));
    }),
    buildMinimalExportFilter: jest.fn(() => undefined),
    applyMinimalExportFilter: jest.fn((spec: Record<string, unknown>) => spec),
    computeResourceDiff: jest.fn(),
    formatDiff: jest.fn().mockReturnValue('+ added field\n- removed field'),
  }),
  { virtual: true },
);

jest.mock('../../api/resourceTypes', () => ({
  getServerDefaultFields: jest.fn().mockReturnValue([]),
  getFieldDefaults: jest.fn().mockReturnValue({}),
  getMinimumConfigFields: jest.fn().mockReturnValue([]),
  getFieldConflicts: jest.fn().mockReturnValue({}),
  RESOURCE_TYPES: {},
}));

jest.mock('../../xcsh/specBridge', () => ({
  getKindResolver: jest.fn().mockReturnValue(mockKindResolver),
}));

// Mock XCSHApiError
jest.mock('../../utils/errors', () => {
  class XCSHApiError extends Error {
    public readonly statusCode: number;
    public readonly body: string;
    constructor(statusCode: number, body: string) {
      super(`API Error ${statusCode}: ${body}`);
      this.name = 'XCSHApiError';
      this.statusCode = statusCode;
      this.body = body;
    }
  }
  return {
    XCSHApiError,
    showError: jest.fn(),
    showWarning: jest.fn(),
    showInfo: jest.fn(),
    withErrorHandling: jest.fn(),
  };
});

import type { ContextManager } from '../../config/contextManager';
import { ResourceService } from '../../services/resourceService';

function makeMockContextManager(): ContextManager {
  return {
    getContext: jest.fn().mockResolvedValue({
      name: 'test-ctx',
      apiUrl: 'https://test.xcsh.dev/api',
      apiToken: 'test-token',
      defaultNamespace: 'default',
    }),
    getClient: jest.fn().mockResolvedValue({
      customRequest: jest.fn().mockResolvedValue({}),
    }),
    getActiveContext: jest.fn().mockResolvedValue({
      name: 'test-ctx',
      apiUrl: 'https://test.xcsh.dev/api',
      apiToken: 'test-token',
      defaultNamespace: 'default',
    }),
  } as unknown as ContextManager;
}

describe('ResourceService', () => {
  let service: ResourceService;
  let mockContextManager: ContextManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContextManager = makeMockContextManager();
    service = new ResourceService(mockContextManager);
  });

  describe('getResourceClient', () => {
    it('creates a ResourceClient with transport adapter', async () => {
      const client = await service.getResourceClient('test-ctx');
      expect(client).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContextManager.getContext).toHaveBeenCalledWith('test-ctx');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContextManager.getClient).toHaveBeenCalledWith('test-ctx');
    });

    it('throws when context not found', async () => {
      (mockContextManager.getContext as jest.Mock).mockResolvedValue(null);
      await expect(service.getResourceClient('missing')).rejects.toThrow('Context "missing" not found');
    });
  });

  describe('exportResource', () => {
    it('returns formatted content on success', async () => {
      mockResourceClient.exportOne.mockResolvedValue({
        manifest: {
          kind: 'http_loadbalancer',
          metadata: { name: 'my-lb', namespace: 'default' },
          spec: { domains: ['example.com'] },
        },
      });

      const result = await service.exportResource('test-ctx', 'http_loadbalancer', 'my-lb', 'default', 'json');

      expect('content' in result).toBe(true);
      if ('content' in result) {
        expect(result.manifest.kind).toBe('http_loadbalancer');
      }
    });

    it('returns error when export fails', async () => {
      mockResourceClient.exportOne.mockResolvedValue({
        error: { kind: 'not_found', message: 'Resource not found' },
      });

      const result = await service.exportResource('test-ctx', 'http_loadbalancer', 'missing', 'default', 'json');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('Resource not found');
      }
    });

    it('returns error when no manifest returned', async () => {
      mockResourceClient.exportOne.mockResolvedValue({});

      const result = await service.exportResource('test-ctx', 'http_loadbalancer', 'my-lb', 'default', 'json');

      expect('error' in result).toBe(true);
    });
  });

  describe('exportAll', () => {
    it('returns manifests and contents map', async () => {
      mockResourceClient.get.mockResolvedValue({
        items: [
          { metadata: { name: 'lb-1', namespace: 'default' }, spec: {} },
          { metadata: { name: 'lb-2', namespace: 'default' }, spec: {} },
        ],
      });
      mockResourceClient.exportOne
        .mockResolvedValueOnce({
          manifest: { kind: 'http_loadbalancer', metadata: { name: 'lb-1' }, spec: { domains: ['a.com'] } },
        })
        .mockResolvedValueOnce({
          manifest: { kind: 'http_loadbalancer', metadata: { name: 'lb-2' }, spec: { domains: ['b.com'] } },
        });

      const result = await service.exportAll('test-ctx', 'http_loadbalancer', 'default', 'json');

      expect('manifests' in result).toBe(true);
      if ('manifests' in result) {
        expect(result.manifests).toHaveLength(2);
        expect(result.contents.size).toBe(2);
        expect(result.contents.has('lb-1')).toBe(true);
        expect(result.contents.has('lb-2')).toBe(true);
      }
    });

    it('returns error when list fails', async () => {
      mockResourceClient.get.mockResolvedValue({
        error: { kind: 'auth', message: 'Unauthorized' },
      });

      const result = await service.exportAll('test-ctx', 'http_loadbalancer', 'default', 'json');

      expect('error' in result).toBe(true);
    });
  });

  describe('applyManifest', () => {
    const validManifest = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: { name: 'my-lb' },
      spec: { domains: ['example.com'] },
    });

    it('delegates to ResourceClient.apply', async () => {
      mockResourceClient.apply.mockResolvedValue({ status: 'created', resource: {}, durationMs: 100 });

      const result = await service.applyManifest('test-ctx', validManifest);

      expect(result.status).toBe('created');
      expect(mockResourceClient.apply).toHaveBeenCalled();
    });

    it('returns unchanged when resource matches', async () => {
      mockResourceClient.apply.mockResolvedValue({ status: 'unchanged', resource: {} });

      const result = await service.applyManifest('test-ctx', validManifest);

      expect(result.status).toBe('unchanged');
    });

    it('returns error for empty content', async () => {
      const piMod = require('@f5xc-salesdemos/pi-resource-management');
      piMod.parseManifests.mockReturnValueOnce([]);

      const result = await service.applyManifest('test-ctx', '{}');

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('No valid manifests');
    });
  });

  describe('createManifest', () => {
    const validManifest = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: { name: 'new-lb' },
      spec: {},
    });

    it('creates when resource does not exist', async () => {
      mockResourceClient.get.mockResolvedValue({ error: { kind: 'not_found', message: 'Not found' } });
      mockResourceClient.create.mockResolvedValue({ status: 'created', resource: {}, durationMs: 50 });

      const result = await service.createManifest('test-ctx', validManifest);

      expect(result.status).toBe('created');
      expect(mockResourceClient.create).toHaveBeenCalled();
    });

    it('returns error when resource already exists', async () => {
      mockResourceClient.get.mockResolvedValue({ resource: { metadata: { name: 'new-lb' }, spec: {} } });

      const result = await service.createManifest('test-ctx', validManifest);

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('already exists');
      expect(mockResourceClient.create).not.toHaveBeenCalled();
    });
  });

  describe('diffManifest', () => {
    const validManifest = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: { name: 'my-lb' },
      spec: { domains: ['example.com'] },
    });

    it('returns isNew true when resource does not exist', async () => {
      mockResourceClient.diff.mockResolvedValue({ isNew: true });

      const result = await service.diffManifest('test-ctx', validManifest);

      expect(result.isNew).toBe(true);
    });

    it('returns diff and remote content when resource exists', async () => {
      mockResourceClient.diff.mockResolvedValue({
        isNew: false,
        diff: { hasDifferences: true, added: [{ path: 'spec.new' }], removed: [], changed: [], unchangedCount: 5 },
      });
      mockResourceClient.get.mockResolvedValue({
        resource: { metadata: { name: 'my-lb' }, spec: { domains: ['old.example.com'] } },
      });

      const result = await service.diffManifest('test-ctx', validManifest);

      expect(result.isNew).toBe(false);
      expect(result.diff?.hasDifferences).toBe(true);
      expect(result.remoteContent).toBeDefined();
    });

    it('returns error when diff fails', async () => {
      mockResourceClient.diff.mockResolvedValue({
        isNew: false,
        error: { kind: 'network', message: 'Connection refused' },
      });

      const result = await service.diffManifest('test-ctx', validManifest);

      expect(result.error).toBe('Connection refused');
    });
  });

  describe('deleteFromManifest', () => {
    const validManifest = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: { name: 'my-lb' },
      spec: {},
    });

    it('delegates to ResourceClient.delete with kind and name', async () => {
      mockResourceClient.delete.mockResolvedValue({
        status: 'deleted',
        name: 'my-lb',
        kind: 'http_loadbalancer',
        durationMs: 30,
      });

      const result = await service.deleteFromManifest('test-ctx', validManifest);

      expect(result.status).toBe('deleted');
      expect(mockResourceClient.delete).toHaveBeenCalledWith(
        'http_loadbalancer',
        'my-lb',
        expect.any(Object),
        undefined,
      );
    });

    it('passes namespace override', async () => {
      mockResourceClient.delete.mockResolvedValue({
        status: 'deleted',
        name: 'my-lb',
        kind: 'http_loadbalancer',
        durationMs: 30,
      });

      await service.deleteFromManifest('test-ctx', validManifest, 'custom-ns');

      expect(mockResourceClient.delete).toHaveBeenCalledWith(
        'http_loadbalancer',
        'my-lb',
        expect.any(Object),
        'custom-ns',
      );
    });
  });

  describe('formatDiff', () => {
    it('delegates to shared package formatDiff', () => {
      const diff = { hasDifferences: true, added: [], removed: [], changed: [], unchangedCount: 0 };
      const result = service.formatDiff(diff);
      expect(result).toContain('added field');
    });
  });
});
