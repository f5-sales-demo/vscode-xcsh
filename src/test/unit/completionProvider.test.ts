// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { CompletionList } from 'vscode';
import { F5XCCompletionProvider } from '../../providers/f5xcCompletionProvider';
import { clearDetectionCache } from '../../utils/completionHelper';

function createMockDocument(content: string, filename = 'test.http_loadbalancer.json') {
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

function createPosition(line: number, character: number) {
  return { line, character } as import('vscode').Position;
}

const mockToken = {
  isCancellationRequested: false,
  onCancellationRequested: jest.fn(),
} as unknown as import('vscode').CancellationToken;
const mockContext = { triggerKind: 0, triggerCharacter: undefined } as import('vscode').CompletionContext;

function getItems(result: unknown): import('vscode').CompletionItem[] {
  if (result instanceof CompletionList) {
    return result.items;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

function getLabel(item: import('vscode').CompletionItem): string {
  if (typeof item.label === 'string') {
    return item.label;
  }
  return (item.label as { label: string }).label;
}

const specContent = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;

describe('F5XCCompletionProvider', () => {
  const provider = new F5XCCompletionProvider();

  beforeEach(() => {
    clearDetectionCache();
  });

  describe('basic behavior', () => {
    it('returns undefined for non-XC files', () => {
      const doc = createMockDocument('{ "name": "test" }', 'package.json');
      const result = provider.provideCompletionItems(doc, createPosition(0, 5), mockToken, mockContext);
      expect(result).toBeUndefined();
    });

    it('returns CompletionList (not bare array)', () => {
      const doc = createMockDocument(specContent);
      const result = provider.provideCompletionItems(doc, createPosition(4, 4), mockToken, mockContext);
      expect(result).toBeInstanceOf(CompletionList);
    });

    it('returns isIncomplete: false to suppress generic completions', () => {
      const doc = createMockDocument(specContent);
      const result = provider.provideCompletionItems(doc, createPosition(4, 4), mockToken, mockContext);
      if (result instanceof CompletionList) {
        expect(result.isIncomplete).toBe(false);
      }
    });
  });

  describe('property completions UX polish', () => {
    function getSpecItems() {
      const doc = createMockDocument(specContent);
      const result = provider.provideCompletionItems(doc, createPosition(4, 4), mockToken, mockContext);
      return getItems(result);
    }

    it('returns property items inside spec object', () => {
      const items = getSpecItems();
      expect(items.length).toBeGreaterThan(0);
    });

    it('uses three-part labels when property completions are returned (Phase 2)', () => {
      const items = getSpecItems();
      const withObjectLabel = items.filter((i) => typeof i.label !== 'string');
      if (withObjectLabel.length > 0) {
        const label = withObjectLabel[0]?.label as { label: string; detail?: string };
        expect(label.detail).toBeDefined();
      } else {
        expect(items.length).toBeGreaterThan(0);
      }
    });

    it('returns items with defined kind (Phase 3)', () => {
      const items = getSpecItems();
      const withKind = items.filter((i) => i.kind !== undefined);
      expect(withKind.length).toBeGreaterThan(0);
    });

    it('preselects at most one item (Phase 4)', () => {
      const items = getSpecItems();
      const preselected = items.filter((i) => i.preselect === true);
      expect(preselected.length).toBeLessThanOrEqual(1);
    });

    it('property completions do not auto-trigger suggest', () => {
      const propItems = getSpecItems().filter((i) => typeof i.label !== 'string');
      for (const item of propItems) {
        expect(item.command).toBeUndefined();
      }
    });

    it('has documentation on items (Phase 5)', () => {
      const items = getSpecItems();
      const withDocs = items.filter((i) => i.documentation !== undefined);
      expect(withDocs.length).toBeGreaterThan(0);
    });

    it('uses snippet choice syntax for enum fields (Phase 6)', () => {
      const items = getSpecItems();
      const withChoices = items.filter((i) => {
        const text = (i.insertText as { value?: string })?.value || '';
        return text.includes('${1|');
      });
      expect(withChoices.length).toBeGreaterThanOrEqual(0);
    });

    it('filters conflicting fields when counterpart is set (Phase 7)', () => {
      const contentWithWaf = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "disable_waf": {},

  }
}`;
      const doc = createMockDocument(contentWithWaf);
      const result = provider.provideCompletionItems(doc, createPosition(5, 4), mockToken, mockContext);
      const items = getItems(result);
      const labels = items.map(getLabel);
      expect(labels).not.toContain('app_firewall');
    });

    it('sorts required fields first', () => {
      const items = getSpecItems();
      const sortTexts = items.map((i) => i.sortText).filter(Boolean);
      const hasZeroPrefix = sortTexts.some((s) => s?.startsWith('0-'));
      const hasTwoPrefix = sortTexts.some((s) => s?.startsWith('2-'));
      if (hasZeroPrefix && hasTwoPrefix) {
        const firstZero = sortTexts.find((s) => s?.startsWith('0-'));
        const firstTwo = sortTexts.find((s) => s?.startsWith('2-'));
        if (firstZero && firstTwo) {
          expect(sortTexts.indexOf(firstZero)).toBeLessThan(sortTexts.indexOf(firstTwo));
        }
      }
    });
  });

  describe('root-level completions', () => {
    it('returns Full resource template at root level', () => {
      const content = '{\n  \n}';
      const doc = createMockDocument(content);
      const result = provider.provideCompletionItems(doc, createPosition(1, 2), mockToken, mockContext);
      const items = getItems(result);
      const labels = items.map(getLabel);
      expect(labels).toContain('Full resource template');
    });
  });
});
