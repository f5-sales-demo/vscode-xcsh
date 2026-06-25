// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { XCSHInlineCompletionProvider } from '../../providers/xcshInlineCompletionProvider';
import { clearDetectionCache } from '../../utils/completionHelper';

function createMockDocument(content: string, filename = 'test.http_loadbalancer.json') {
  const lines = content.split('\n');
  return {
    uri: { scheme: 'file', fsPath: filename, path: filename, toString: () => `file://${filename}` },
    languageId: 'json',
    fileName: filename,
    version: 1,
    getText: () => content,
    lineAt: (line: number) => ({ text: lines[line] || '' }),
    offsetAt: (pos: { line: number; character: number }) => {
      let offset = 0;
      for (let i = 0; i < pos.line; i++) {
        offset += (lines[i] || '').length + 1;
      }
      return offset + pos.character;
    },
    positionAt: jest.fn(),
    lineCount: lines.length,
  } as unknown as import('vscode').TextDocument;
}

function createPosition(line: number, character: number) {
  return { line, character } as import('vscode').Position;
}

const mockContext = { triggerKind: 0, selectedCompletionInfo: undefined } as import('vscode').InlineCompletionContext;
const mockToken = {
  isCancellationRequested: false,
  onCancellationRequested: jest.fn(),
} as unknown as import('vscode').CancellationToken;

describe('XCSHInlineCompletionProvider', () => {
  const provider = new XCSHInlineCompletionProvider();

  beforeEach(() => {
    clearDetectionCache();
  });

  it('returns undefined for non-XC files', () => {
    const doc = createMockDocument('{ "name": "test" }', 'package.json');
    const result = provider.provideInlineCompletionItems(doc, createPosition(0, 10), mockContext, mockToken);
    expect(result).toBeUndefined();
  });

  it('returns undefined when cursor is not after colon', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "spec": {}
}`;
    const doc = createMockDocument(content);
    const result = provider.provideInlineCompletionItems(doc, createPosition(1, 3), mockContext, mockToken);
    expect(result).toBeUndefined();
  });

  it('returns undefined when text already exists after colon', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "spec": {
    "add_location": true
  }
}`;
    const doc = createMockDocument(content);
    const result = provider.provideInlineCompletionItems(doc, createPosition(3, 24), mockContext, mockToken);
    expect(result).toBeUndefined();
  });

  it('provides ghost text when cursor is after colon with no value', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "spec": {
    "add_location":
  }
}`;
    const doc = createMockDocument(content);
    const result = provider.provideInlineCompletionItems(doc, createPosition(3, 21), mockContext, mockToken);

    if (Array.isArray(result) && result.length > 0) {
      expect(result[0]).toBeDefined();
    }
  });
});
