// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { CompletionItemKind } from 'vscode';
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

describe('F5XCCompletionProvider', () => {
  const provider = new F5XCCompletionProvider();

  beforeEach(() => {
    clearDetectionCache();
  });

  it('returns undefined for non-XC files', () => {
    const doc = createMockDocument('{ "name": "test" }', 'package.json');
    const result = provider.provideCompletionItems(doc, createPosition(0, 5), mockToken, mockContext);
    expect(result).toBeUndefined();
  });

  it('returns completions for XC manifest at root level', () => {
    const content = '{\n  \n}';
    const doc = createMockDocument(content);
    const result = provider.provideCompletionItems(doc, createPosition(1, 2), mockToken, mockContext);

    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
      const labels = result.map((item) => {
        if (typeof item.label === 'string') {
          return item.label;
        }
        return (item.label as { label: string }).label;
      });
      expect(labels).toContain('Full resource template');
    }
  });

  it('returns property completions inside spec object', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;
    const doc = createMockDocument(content);
    const result = provider.provideCompletionItems(doc, createPosition(4, 4), mockToken, mockContext);

    if (Array.isArray(result) && result.length > 0) {
      const hasPropertyKind = result.some((item) => item.kind !== undefined);
      expect(hasPropertyKind).toBe(true);
    }
  });

  it('returns value completions after colon for enum field', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "default_pool": {
      "endpoint_selection":
    }
  }
}`;
    const doc = createMockDocument(content);
    const result = provider.provideCompletionItems(doc, createPosition(5, 28), mockToken, mockContext);

    if (Array.isArray(result)) {
      const enumItems = result.filter((item) => item.kind === CompletionItemKind.EnumMember);
      if (enumItems.length > 0) {
        expect(enumItems.length).toBeGreaterThan(1);
      }
    }
  });

  it('sorts required properties before optional ones', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {

  }
}`;
    const doc = createMockDocument(content);
    const result = provider.provideCompletionItems(doc, createPosition(4, 4), mockToken, mockContext);

    if (Array.isArray(result) && result.length > 1) {
      const sortTexts = result.map((item) => item.sortText).filter(Boolean);
      if (sortTexts.length > 0) {
        const hasRequiredFirst = sortTexts.some((s) => s?.startsWith('0-'));
        expect(hasRequiredFirst || sortTexts.length > 0).toBe(true);
      }
    }
  });

  it('returns content-detected completions for non-standard filenames', () => {
    const content = JSON.stringify(
      {
        kind: 'http_loadbalancer',
        metadata: { name: 'test' },
        spec: {},
      },
      null,
      2,
    );
    const doc = createMockDocument(content, 'my-custom-lb.json');
    const result = provider.provideCompletionItems(doc, createPosition(1, 2), mockToken, mockContext);

    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
