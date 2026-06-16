// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import {
  clearDetectionCache,
  detectResourceType,
  extractResourceTypeFromFilename,
  isF5XCJsonFile,
} from '../../utils/completionHelper';

function createMockDocument(options: {
  content?: string;
  filename?: string;
  scheme?: string;
  languageId?: string;
  version?: number;
  uri?: { scheme: string; fsPath: string; path: string; toString: () => string };
}) {
  const scheme = options.scheme ?? 'file';
  const filename = options.filename ?? 'test.json';
  const uri = options.uri ?? {
    scheme,
    fsPath: filename,
    path: scheme === 'f5xc' ? filename : filename,
    toString: () => `${scheme}://${filename}`,
  };

  return {
    uri,
    languageId: options.languageId ?? 'json',
    fileName: filename,
    version: options.version ?? 1,
    getText: () => options.content ?? '',
    lineAt: jest.fn(),
    offsetAt: jest.fn(),
    positionAt: jest.fn(),
    lineCount: 1,
  } as unknown as import('vscode').TextDocument;
}

describe('completionHelper', () => {
  beforeEach(() => {
    clearDetectionCache();
  });

  describe('extractResourceTypeFromFilename', () => {
    it('extracts kind from name.kind.json pattern', () => {
      expect(extractResourceTypeFromFilename('my-lb.http_loadbalancer.json')).toBe('http_loadbalancer');
    });

    it('extracts kind from kind.json pattern for known types', () => {
      expect(extractResourceTypeFromFilename('http_loadbalancer.json')).toBe('http_loadbalancer');
    });

    it('returns undefined for unknown resource types', () => {
      expect(extractResourceTypeFromFilename('random-file.json')).toBeUndefined();
    });

    it('returns undefined for non-json files', () => {
      expect(extractResourceTypeFromFilename('file.yaml')).toBeUndefined();
    });

    it('extracts from paths with directories', () => {
      expect(extractResourceTypeFromFilename('/some/path/lb.http_loadbalancer.json')).toBe('http_loadbalancer');
    });
  });

  describe('detectResourceType', () => {
    it('detects from f5xc:// scheme URI', () => {
      // f5xc://profile/namespace/resourceType/resourceName.json
      // parts[1] is the namespace (second path component)
      const doc = createMockDocument({
        scheme: 'f5xc',
        filename: '/profile/http_loadbalancer/my-lb.json',
      });
      const result = detectResourceType(doc);
      expect(result).toBe('http_loadbalancer');
    });

    it('detects from filename pattern', () => {
      const doc = createMockDocument({
        filename: 'my-lb.http_loadbalancer.json',
      });
      const result = detectResourceType(doc);
      expect(result).toBe('http_loadbalancer');
    });

    it('detects from file content when filename does not match', () => {
      const content = JSON.stringify({
        kind: 'http_loadbalancer',
        metadata: { name: 'my-lb', namespace: 'default' },
        spec: { domains: ['example.com'] },
      });
      const doc = createMockDocument({
        filename: 'my-custom-name.json',
        content,
      });
      const result = detectResourceType(doc);
      expect(result).toBe('http_loadbalancer');
    });

    it('returns undefined for non-XC JSON files', () => {
      const content = JSON.stringify({ name: 'package', version: '1.0.0' });
      const doc = createMockDocument({
        filename: 'package.json',
        content,
      });
      const result = detectResourceType(doc);
      expect(result).toBeUndefined();
    });

    it('detects from YAML content', () => {
      const content = `kind: origin_pool\nmetadata:\n  name: my-pool\nspec:\n  port: 443\n`;
      const doc = createMockDocument({
        filename: 'my-pool.yaml',
        content,
        languageId: 'yaml',
      });
      const result = detectResourceType(doc);
      expect(result).toBe('origin_pool');
    });

    it('caches detection result per document version', () => {
      const content = JSON.stringify({
        kind: 'healthcheck',
        metadata: { name: 'hc1' },
        spec: {},
      });
      const doc = createMockDocument({ filename: 'hc.json', content, version: 1 });
      const result1 = detectResourceType(doc);
      const result2 = detectResourceType(doc);
      expect(result1).toBe('healthcheck');
      expect(result2).toBe('healthcheck');
    });

    it('invalidates cache when document version changes', () => {
      const doc1 = createMockDocument({
        filename: 'test.json',
        content: JSON.stringify({ kind: 'healthcheck', metadata: { name: 'hc1' }, spec: {} }),
        version: 1,
      });
      detectResourceType(doc1);

      const doc2 = createMockDocument({
        filename: 'test.json',
        content: JSON.stringify({ kind: 'origin_pool', metadata: { name: 'op1' }, spec: {} }),
        version: 2,
      });
      const result = detectResourceType(doc2);
      expect(result).toBe('origin_pool');
    });
  });

  describe('isF5XCJsonFile', () => {
    it('returns true for f5xc:// scheme', () => {
      const doc = createMockDocument({ scheme: 'f5xc', languageId: 'json' });
      expect(isF5XCJsonFile(doc)).toBe(true);
    });

    it('returns true for filename match', () => {
      const doc = createMockDocument({ filename: 'my.http_loadbalancer.json', languageId: 'json' });
      expect(isF5XCJsonFile(doc)).toBe(true);
    });

    it('returns true for content-detected XC manifest', () => {
      const content = JSON.stringify({
        kind: 'app_firewall',
        metadata: { name: 'waf1' },
        spec: {},
      });
      const doc = createMockDocument({ filename: 'waf.json', content, languageId: 'json' });
      expect(isF5XCJsonFile(doc)).toBe(true);
    });

    it('returns false for non-JSON language', () => {
      const doc = createMockDocument({ languageId: 'typescript' });
      expect(isF5XCJsonFile(doc)).toBe(false);
    });

    it('returns false for generic JSON files', () => {
      const content = JSON.stringify({ name: 'test' });
      const doc = createMockDocument({ filename: 'config.json', content, languageId: 'json' });
      expect(isF5XCJsonFile(doc)).toBe(false);
    });
  });
});
