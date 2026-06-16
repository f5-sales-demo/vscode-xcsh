// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

jest.mock('vscode', () => ({
  window: {
    onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
    activeTextEditor: undefined,
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
    onDidOpenTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    getConfiguration: jest.fn(() => ({
      get: jest.fn().mockReturnValue('info'),
    })),
  },
  commands: {
    executeCommand: jest.fn(),
  },
}));

import { getManifestKind, isXCManifest } from '../../utils/manifestDetector';

describe('isXCManifest', () => {
  it('detects valid JSON manifest with known kind', () => {
    const content = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: { name: 'my-lb', namespace: 'default' },
      spec: { domains: ['example.com'] },
    });
    expect(isXCManifest(content)).toBe(true);
  });

  it('detects valid JSON manifest with minimal fields', () => {
    const content = JSON.stringify({
      kind: 'origin_pool',
      metadata: { name: 'my-pool' },
    });
    expect(isXCManifest(content)).toBe(true);
  });

  it('rejects JSON with unknown kind', () => {
    const content = JSON.stringify({
      kind: 'not_a_real_resource_type',
      metadata: { name: 'test' },
    });
    expect(isXCManifest(content)).toBe(false);
  });

  it('rejects JSON missing kind', () => {
    const content = JSON.stringify({
      metadata: { name: 'test' },
      spec: {},
    });
    expect(isXCManifest(content)).toBe(false);
  });

  it('rejects JSON missing metadata.name', () => {
    const content = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: {},
    });
    expect(isXCManifest(content)).toBe(false);
  });

  it('rejects JSON missing metadata entirely', () => {
    const content = JSON.stringify({
      kind: 'http_loadbalancer',
    });
    expect(isXCManifest(content)).toBe(false);
  });

  it('rejects empty JSON object', () => {
    expect(isXCManifest('{}')).toBe(false);
  });

  it('rejects JSON array', () => {
    expect(isXCManifest('[{"kind": "http_loadbalancer"}]')).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(isXCManifest('not json at all')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isXCManifest('')).toBe(false);
  });

  it('detects valid YAML manifest', () => {
    const content = `kind: http_loadbalancer
metadata:
  name: my-lb
  namespace: default
spec:
  domains:
    - example.com`;
    expect(isXCManifest(content)).toBe(true);
  });

  it('detects YAML with document separator', () => {
    const content = `---
kind: origin_pool
metadata:
  name: my-pool`;
    expect(isXCManifest(content)).toBe(true);
  });

  it('rejects YAML with unknown kind', () => {
    const content = `kind: kubernetes_deployment
metadata:
  name: test`;
    expect(isXCManifest(content)).toBe(false);
  });

  it('rejects plain text file', () => {
    expect(isXCManifest('Hello world\nThis is not a manifest')).toBe(false);
  });

  it('rejects package.json-like JSON', () => {
    const content = JSON.stringify({
      name: 'my-package',
      version: '1.0.0',
      dependencies: {},
    });
    expect(isXCManifest(content)).toBe(false);
  });
});

describe('getManifestKind', () => {
  it('returns kind from valid JSON manifest', () => {
    const content = JSON.stringify({
      kind: 'http_loadbalancer',
      metadata: { name: 'test' },
    });
    expect(getManifestKind(content)).toBe('http_loadbalancer');
  });

  it('returns kind from valid YAML manifest', () => {
    const content = `kind: origin_pool
metadata:
  name: test`;
    expect(getManifestKind(content)).toBe('origin_pool');
  });

  it('returns undefined for non-manifest', () => {
    expect(getManifestKind('{}')).toBeUndefined();
  });

  it('returns undefined for unknown kind', () => {
    const content = JSON.stringify({ kind: 'fake_kind', metadata: { name: 'test' } });
    expect(getManifestKind(content)).toBeUndefined();
  });
});
