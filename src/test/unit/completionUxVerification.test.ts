// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Automated UX verification tests for intellisense.
 * These tests simulate real user scenarios to catch issues
 * that were previously only found during manual UAT.
 */

import { CompletionList } from 'vscode';
import { getServerDefaultFields } from '../../api/resourceTypes';
import { XCSHCompletionProvider } from '../../providers/xcshCompletionProvider';
import { getSchemaRegistry } from '../../schema/schemaRegistry';
import { clearDetectionCache } from '../../utils/completionHelper';

function createMockDocument(content: string, filename: string) {
  const lines = content.split('\n');
  return {
    uri: { scheme: 'file', fsPath: filename, path: filename, toString: () => `file://${filename}` },
    languageId: 'json',
    fileName: filename,
    version: 1,
    getText: () => content,
    lineAt: (line: number) => ({
      text: lines[line] || '',
      range: { start: { line, character: 0 }, end: { line, character: (lines[line] || '').length } },
    }),
    offsetAt: (pos: { line: number; character: number }) => {
      let offset = 0;
      for (let i = 0; i < pos.line; i++) {
        offset += (lines[i] || '').length + 1;
      }
      return offset + pos.character;
    },
    positionAt: jest.fn(),
    lineCount: lines.length,
    getWordRangeAtPosition: jest.fn(),
  } as unknown as import('vscode').TextDocument;
}

function pos(line: number, character: number) {
  return { line, character } as import('vscode').Position;
}

const token = {
  isCancellationRequested: false,
  onCancellationRequested: jest.fn(),
} as unknown as import('vscode').CancellationToken;
const ctx = { triggerKind: 0, triggerCharacter: undefined } as import('vscode').CompletionContext;

function getCompletionLabels(result: unknown): string[] {
  let items: import('vscode').CompletionItem[] = [];
  if (result instanceof CompletionList) {
    items = result.items;
  } else if (Array.isArray(result)) {
    items = result;
  }
  return items.map((i) => (typeof i.label === 'string' ? i.label : (i.label as { label: string }).label));
}

describe('Intellisense UX Verification', () => {
  const provider = new XCSHCompletionProvider();

  beforeEach(() => {
    clearDetectionCache();
  });

  describe('completions only suggest schema-valid fields', () => {
    const resourceTypes = ['http_loadbalancer', 'origin_pool', 'healthcheck', 'app_firewall'];

    for (const resourceType of resourceTypes) {
      it(`${resourceType}: all suggested fields exist in schema`, () => {
        const content = `{
  "kind": "${resourceType}",
  "metadata": { "name": "test", "namespace": "default" },
  "spec": {

  }
}`;
        const doc = createMockDocument(content, `test.${resourceType}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), token, ctx);
        const labels = getCompletionLabels(result);

        const registry = getSchemaRegistry();
        const schema = registry.getOrGenerateSchema(resourceType);
        if (!schema?.properties?.spec?.properties) {
          return;
        }

        const validFields = new Set(Object.keys(schema.properties.spec.properties));

        for (const label of labels) {
          if (label.includes('template') || label.includes('section')) {
            continue;
          }
          expect(validFields).toContain(label);
        }
      });
    }
  });

  describe('completions never suggest invalid cross-resource fields', () => {
    it('http_loadbalancer does not suggest health_checks (origin_pool field)', () => {
      const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;
      const doc = createMockDocument(content, 'test.http_loadbalancer.json');
      const result = provider.provideCompletionItems(doc, pos(4, 4), token, ctx);
      const labels = getCompletionLabels(result);
      expect(labels).not.toContain('health_checks');
      expect(labels).not.toContain('load_balancing');
      expect(labels).not.toContain('protocol');
    });

    it('origin_pool does not suggest domains (http_loadbalancer field)', () => {
      const content = `{
  "kind": "origin_pool",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;
      const doc = createMockDocument(content, 'test.origin_pool.json');
      const result = provider.provideCompletionItems(doc, pos(4, 4), token, ctx);
      const labels = getCompletionLabels(result);
      expect(labels).not.toContain('domains');
      expect(labels).not.toContain('routes');
      expect(labels).not.toContain('https_auto_cert');
    });
  });

  describe('server-default fields are not prominently suggested', () => {
    const resourceTypes = ['http_loadbalancer', 'origin_pool', 'healthcheck'];

    for (const resourceType of resourceTypes) {
      it(`${resourceType}: server-default fields do not have preselect`, () => {
        const content = `{
  "kind": "${resourceType}",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;
        const doc = createMockDocument(content, `test.${resourceType}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), token, ctx);

        let items: import('vscode').CompletionItem[] = [];
        if (result instanceof CompletionList) {
          items = result.items;
        }

        const serverDefaults = getServerDefaultFields(resourceType).map(
          (f) => f.replace('spec.', '').split('.')[0] || '',
        );

        for (const item of items) {
          const label = typeof item.label === 'string' ? item.label : (item.label as { label: string }).label;
          if (serverDefaults.includes(label) && item.preselect) {
            fail(`Server-default field "${label}" should not be preselected`);
          }
        }
      });
    }
  });

  describe('CompletionList returns isIncomplete: false', () => {
    it('suppresses generic JSON completions for XC manifests', () => {
      const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;
      const doc = createMockDocument(content, 'test.http_loadbalancer.json');
      const result = provider.provideCompletionItems(doc, pos(4, 4), token, ctx);
      expect(result).toBeInstanceOf(CompletionList);
      if (result instanceof CompletionList) {
        expect(result.isIncomplete).toBe(false);
      }
    });
  });

  describe('already-set fields are excluded from suggestions', () => {
    it('does not suggest origin_servers when already in the file', () => {
      const content = `{
  "kind": "origin_pool",
  "metadata": { "name": "test" },
  "spec": {
    "origin_servers": [],
    "port": 8080,

  }
}`;
      const doc = createMockDocument(content, 'test.origin_pool.json');
      const result = provider.provideCompletionItems(doc, pos(7, 4), token, ctx);
      const labels = getCompletionLabels(result);
      expect(labels).not.toContain('origin_servers');
      expect(labels).not.toContain('port');
    });
  });

  describe('oneOf toggle fields default to empty object', () => {
    it('enable/disable toggle fields insert {} not true/false', () => {
      const content = `{
  "kind": "origin_pool",
  "metadata": { "name": "test" },
  "spec": {
    "advanced_options": {

    }
  }
}`;
      const doc = createMockDocument(content, 'test.origin_pool.json');
      const result = provider.provideCompletionItems(doc, pos(6, 6), token, ctx);
      let items: import('vscode').CompletionItem[] = [];
      if (result instanceof CompletionList) {
        items = result.items;
      }

      const toggleItem = items.find((i) => {
        const label = typeof i.label === 'string' ? i.label : (i.label as { label: string }).label;
        return label.startsWith('enable_') || label.startsWith('disable_');
      });

      if (toggleItem) {
        const snippet = (toggleItem.insertText as { value: string })?.value || '';
        expect(snippet).toContain('{}');
        expect(snippet).not.toContain('true');
        expect(snippet).not.toContain('false');
      }
    });
  });

  describe('conflict-aware filtering works across resources', () => {
    it('hides app_firewall when disable_waf is set', () => {
      const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "disable_waf": {},

  }
}`;
      const doc = createMockDocument(content, 'test.http_loadbalancer.json');
      const result = provider.provideCompletionItems(doc, pos(5, 4), token, ctx);
      const labels = getCompletionLabels(result);
      expect(labels).not.toContain('app_firewall');
    });

    it('hides disable_waf when app_firewall is set', () => {
      const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "app_firewall": {},

  }
}`;
      const doc = createMockDocument(content, 'test.http_loadbalancer.json');
      const result = provider.provideCompletionItems(doc, pos(5, 4), token, ctx);
      const labels = getCompletionLabels(result);
      expect(labels).not.toContain('disable_waf');
    });
  });
});
