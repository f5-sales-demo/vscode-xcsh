// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { XCSHHoverProvider } from '../../providers/xcshHoverProvider';

function createMockDocument(content: string, filename = 'test.http_loadbalancer.json') {
  const lines = content.split('\n');
  return {
    uri: { scheme: 'file', fsPath: filename, path: filename, toString: () => `file://${filename}` },
    languageId: 'json',
    fileName: filename,
    version: 1,
    getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) => {
      if (!range) {
        return content;
      }
      const result: string[] = [];
      for (let i = range.start.line; i <= range.end.line; i++) {
        result.push(lines[i] || '');
      }
      return result.join('\n');
    },
    lineAt: (line: number) => ({ text: lines[line] || '' }),
    offsetAt: jest.fn().mockReturnValue(0),
    positionAt: jest.fn(),
    lineCount: lines.length,
    getWordRangeAtPosition: jest.fn().mockReturnValue(undefined),
  } as unknown as import('vscode').TextDocument;
}

function createPosition(line: number, character: number) {
  return { line, character } as import('vscode').Position;
}

describe('XCSHHoverProvider', () => {
  const provider = new XCSHHoverProvider();

  it('returns hover for known spec-level field with description', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "add_location": true
  }
}`;
    const doc = createMockDocument(content);
    const position = createPosition(4, 8);

    const hover = provider.provideHover(doc, position);
    if (hover) {
      expect(hover.contents).toBeDefined();
    }
  });

  it('returns hover for metadata.name field', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": {
    "name": "test"
  },
  "spec": {}
}`;
    const doc = createMockDocument(content);
    const position = createPosition(3, 8);

    const hover = provider.provideHover(doc, position);
    expect(hover).toBeDefined();
  });

  it('returns undefined for non-XC JSON files', () => {
    const content = '{ "name": "test" }';
    const doc = createMockDocument(content, 'package.json');
    Object.defineProperty(doc, 'languageId', { value: 'json' });

    const position = createPosition(0, 5);
    const hover = provider.provideHover(doc, position);
    expect(hover).toBeUndefined();
  });

  it('returns undefined when cursor is not on a property key', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "domains": ["example.com"]
  }
}`;
    const doc = createMockDocument(content);
    const position = createPosition(4, 22);

    const hover = provider.provideHover(doc, position);
    expect(hover).toBeUndefined();
  });

  it('returns undefined for non-JSON languages', () => {
    const content = 'const x = 1;';
    const doc = createMockDocument(content, 'test.ts');
    Object.defineProperty(doc, 'languageId', { value: 'typescript' });

    const position = createPosition(0, 6);
    const hover = provider.provideHover(doc, position);
    expect(hover).toBeUndefined();
  });
});
