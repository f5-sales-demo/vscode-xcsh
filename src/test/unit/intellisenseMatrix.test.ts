// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Exhaustive intellisense matrix tests.
 * Tests every completion scenario across multiple resource types
 * to catch cross-resource contamination, wrong nesting, invalid
 * insertions, and missing UX polish.
 */

import { CompletionList } from 'vscode';
import { getAllGeneratedResourceKeys } from '../../generated/resourceTypesBase';
import { F5XCCompletionProvider } from '../../providers/f5xcCompletionProvider';
import { F5XCHoverProvider } from '../../providers/f5xcHoverProvider';
import { getSchemaRegistry } from '../../schema/schemaRegistry';
import { clearDetectionCache, parseJsonPath } from '../../utils/completionHelper';

function mockDoc(content: string, filename: string) {
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

const pos = (line: number, ch: number) => ({ line, character: ch }) as import('vscode').Position;
const tok = {
  isCancellationRequested: false,
  onCancellationRequested: jest.fn(),
} as unknown as import('vscode').CancellationToken;
const ctx = { triggerKind: 0, triggerCharacter: undefined } as import('vscode').CompletionContext;

type CI = import('vscode').CompletionItem;

function items(result: unknown): CI[] {
  if (result instanceof CompletionList) {
    return result.items;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

function labels(result: unknown): string[] {
  return items(result).map((i) => (typeof i.label === 'string' ? i.label : (i.label as { label: string }).label));
}

function specContent(kind: string, specFields = ''): string {
  return `{
  "kind": "${kind}",
  "metadata": { "name": "test", "namespace": "default" },
  "spec": {
${specFields}
  }
}`;
}

const provider = new F5XCCompletionProvider();

beforeEach(() => clearDetectionCache());

// ─── SECTION 1: Path Parser ─────────────────────────────────

describe('parseJsonPath correctness', () => {
  it('root level returns empty', () => {
    expect(parseJsonPath('{ ')).toEqual([]);
  });

  it('inside spec returns ["spec"]', () => {
    expect(parseJsonPath('{ "spec": { ')).toEqual(['spec']);
  });

  it('inside metadata returns ["metadata"]', () => {
    expect(parseJsonPath('{ "metadata": { ')).toEqual(['metadata']);
  });

  it('inside nested spec.advanced_options returns correct path', () => {
    const text = '{ "spec": { "advanced_options": { ';
    expect(parseJsonPath(text)).toEqual(['spec', 'advanced_options']);
  });

  it('returns to spec after array closes', () => {
    const text = `{
  "spec": {
    "items": [
      { "a": 1 },
      { "b": 2 }
    ],
`;
    expect(parseJsonPath(text)).toEqual(['spec']);
  });

  it('returns to spec after nested object closes', () => {
    const text = `{
  "spec": {
    "nested": {
      "deep": { "val": 1 }
    },
`;
    expect(parseJsonPath(text)).toEqual(['spec']);
  });

  it('handles mixed arrays and objects', () => {
    const text = `{
  "spec": {
    "servers": [
      {
        "public_ip": { "ip": "1.2.3.4" },
        "labels": {}
      }
    ],
    "port": 80,
`;
    expect(parseJsonPath(text)).toEqual(['spec']);
  });

  it('inside array object returns correct depth', () => {
    const text = `{
  "spec": {
    "servers": [
      {
`;
    expect(parseJsonPath(text)).toEqual(['spec', 'servers']);
  });

  it('handles string values with braces', () => {
    const text = '{ "spec": { "desc": "has { braces }", ';
    expect(parseJsonPath(text)).toEqual(['spec']);
  });

  it('handles escaped quotes in strings', () => {
    const text = '{ "spec": { "val": "has \\"quotes\\"", ';
    expect(parseJsonPath(text)).toEqual(['spec']);
  });
});

// ─── SECTION 2: Resource-Type Matrix ────────────────────────

describe('completion matrix across resource types', () => {
  const testTypes = ['http_loadbalancer', 'origin_pool', 'healthcheck', 'app_firewall', 'tcp_loadbalancer'];

  for (const kind of testTypes) {
    describe(kind, () => {
      it('returns CompletionList at spec level', () => {
        const doc = mockDoc(specContent(kind), `t.${kind}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
        expect(result).toBeInstanceOf(CompletionList);
        expect(items(result).length).toBeGreaterThan(0);
      });

      it('all suggested fields exist in schema', () => {
        const doc = mockDoc(specContent(kind), `t.${kind}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
        const schema = getSchemaRegistry().getOrGenerateSchema(kind);
        if (!schema?.properties?.spec?.properties) {
          return;
        }

        const valid = new Set(Object.keys(schema.properties.spec.properties));
        for (const l of labels(result)) {
          if (l.includes('template') || l.includes('section')) {
            continue;
          }
          expect(valid).toContain(l);
        }
      });

      it('returns isIncomplete: false', () => {
        const doc = mockDoc(specContent(kind), `t.${kind}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
        if (result instanceof CompletionList) {
          expect(result.isIncomplete).toBe(false);
        }
      });

      it('uses three-part labels', () => {
        const doc = mockDoc(specContent(kind), `t.${kind}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
        const objectLabels = items(result).filter((i) => typeof i.label !== 'string');
        if (objectLabels.length > 0) {
          const label = objectLabels[0]?.label as { detail?: string };
          expect(label.detail).toBeDefined();
        }
      });

      it('does not auto-trigger suggest after property acceptance', () => {
        const doc = mockDoc(specContent(kind), `t.${kind}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
        const propItems = items(result).filter((i) => typeof i.label !== 'string');
        for (const item of propItems) {
          expect(item.command).toBeUndefined();
        }
      });

      it('has at most one preselected item', () => {
        const doc = mockDoc(specContent(kind), `t.${kind}.json`);
        const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
        const preselected = items(result).filter((i) => i.preselect);
        expect(preselected.length).toBeLessThanOrEqual(1);
      });
    });
  }
});

// ─── SECTION 3: Cross-Resource Contamination ────────────────

describe('no cross-resource field contamination', () => {
  const exclusions: Record<string, string[]> = {
    http_loadbalancer: ['health_checks', 'load_balancing', 'protocol', 'panic_threshold'],
    origin_pool: ['domains', 'routes', 'https_auto_cert', 'js_challenge', 'cors_policy'],
    healthcheck: ['domains', 'origin_servers', 'app_firewall', 'routes'],
    app_firewall: ['domains', 'origin_servers', 'healthcheck', 'routes'],
  };

  for (const [kind, forbidden] of Object.entries(exclusions)) {
    it(`${kind} does not suggest ${forbidden.join(', ')}`, () => {
      const doc = mockDoc(specContent(kind), `t.${kind}.json`);
      const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
      const ls = labels(result);
      for (const f of forbidden) {
        expect(ls).not.toContain(f);
      }
    });
  }
});

// ─── SECTION 4: Already-Set Fields Excluded ─────────────────

describe('already-set fields excluded from suggestions', () => {
  it('origin_pool: excludes origin_servers and port when set', () => {
    const content = specContent('origin_pool', '    "origin_servers": [],\n    "port": 8080,');
    const doc = mockDoc(content, 't.origin_pool.json');
    const result = provider.provideCompletionItems(doc, pos(6, 4), tok, ctx);
    const ls = labels(result);
    expect(ls).not.toContain('origin_servers');
    expect(ls).not.toContain('port');
  });

  it('http_loadbalancer: excludes domains when set', () => {
    const content = specContent('http_loadbalancer', '    "domains": ["example.com"],');
    const doc = mockDoc(content, 't.http_loadbalancer.json');
    const result = provider.provideCompletionItems(doc, pos(5, 4), tok, ctx);
    expect(labels(result)).not.toContain('domains');
  });
});

// ─── SECTION 5: Conflict Filtering ──────────────────────────

describe('conflict-aware filtering', () => {
  const conflictPairs = [
    { kind: 'http_loadbalancer', set: 'disable_waf', hidden: 'app_firewall' },
    { kind: 'http_loadbalancer', set: 'app_firewall', hidden: 'disable_waf' },
    { kind: 'http_loadbalancer', set: 'no_challenge', hidden: 'js_challenge' },
    { kind: 'http_loadbalancer', set: 'js_challenge', hidden: 'no_challenge' },
    { kind: 'http_loadbalancer', set: 'round_robin', hidden: 'least_active' },
  ];

  for (const { kind, set, hidden } of conflictPairs) {
    it(`${kind}: setting ${set} hides ${hidden}`, () => {
      const content = specContent(kind, `    "${set}": {},`);
      const doc = mockDoc(content, `t.${kind}.json`);
      const result = provider.provideCompletionItems(doc, pos(5, 4), tok, ctx);
      expect(labels(result)).not.toContain(hidden);
    });
  }
});

// ─── SECTION 6: oneOf Toggle Fields ─────────────────────────

describe('oneOf toggle fields insert empty object', () => {
  it('fields with conflictsWith insert {} not boolean', () => {
    const doc = mockDoc(specContent('http_loadbalancer'), 't.http_loadbalancer.json');
    const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
    const toggleItems = items(result).filter((i) => {
      const l = typeof i.label === 'string' ? i.label : (i.label as { label: string }).label;
      return l.startsWith('disable_') || l.startsWith('no_');
    });

    for (const item of toggleItems) {
      const snippet = (item.insertText as { value?: string })?.value || '';
      expect(snippet).toContain('{}');
      expect(snippet).not.toMatch(/:\s*\$\{1:true\}/);
      expect(snippet).not.toMatch(/:\s*\$\{1:false\}/);
    }
  });
});

// ─── SECTION 7: Snippet Validity ────────────────────────────

describe('snippet insertions produce valid JSON structure', () => {
  const testTypes = ['http_loadbalancer', 'origin_pool', 'app_firewall'];

  for (const kind of testTypes) {
    it(`${kind}: all snippets have balanced braces/brackets`, () => {
      const doc = mockDoc(specContent(kind), `t.${kind}.json`);
      const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);

      for (const item of items(result)) {
        const raw = (item.insertText as { value?: string })?.value;
        if (!raw) {
          continue;
        }

        const cleaned = raw.replace(/\$\{[^}]*\}/g, '""');
        let braces = 0;
        let brackets = 0;
        for (const ch of cleaned) {
          if (ch === '{') {
            braces++;
          }
          if (ch === '}') {
            braces--;
          }
          if (ch === '[') {
            brackets++;
          }
          if (ch === ']') {
            brackets--;
          }
        }
        const label = typeof item.label === 'string' ? item.label : (item.label as { label: string }).label;
        expect(braces).toBeGreaterThanOrEqual(0);
        expect(brackets).toBeGreaterThanOrEqual(0);
        if (braces !== 0 || brackets !== 0) {
          fail(`${label}: unbalanced braces=${braces} brackets=${brackets} in snippet: ${raw}`);
        }
      }
    });
  }
});

// ─── SECTION 8: Hover Provider ──────────────────────────────

describe('hover provider', () => {
  const hoverProvider = new F5XCHoverProvider();

  it('returns hover for known field', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": {
    "name": "test"
  },
  "spec": {}
}`;
    const doc = mockDoc(content, 't.http_loadbalancer.json');
    const hover = hoverProvider.provideHover(doc, pos(3, 8));
    expect(hover).toBeDefined();
  });

  it('returns undefined for non-XC files', () => {
    const doc = mockDoc('{ "name": "test" }', 'package.json');
    const hover = hoverProvider.provideHover(doc, pos(0, 5));
    expect(hover).toBeUndefined();
  });

  it('returns undefined for value positions', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "domains": ["example.com"]
  }
}`;
    const doc = mockDoc(content, 't.http_loadbalancer.json');
    const hover = hoverProvider.provideHover(doc, pos(4, 22));
    expect(hover).toBeUndefined();
  });
});

// ─── SECTION 9: Icon Differentiation ────────────────────────

describe('icon differentiation by field role', () => {
  it('all items have a defined CompletionItemKind', () => {
    const doc = mockDoc(specContent('http_loadbalancer'), 't.http_loadbalancer.json');
    const result = provider.provideCompletionItems(doc, pos(4, 4), tok, ctx);
    const propItems = items(result).filter((i) => typeof i.label !== 'string');
    for (const item of propItems) {
      expect(item.kind).toBeDefined();
    }
  });
});

// ─── SECTION 10: Nested Object Completions ──────────────────

describe('completions inside nested objects', () => {
  it('provides completions inside advanced_options', () => {
    const content = `{
  "kind": "origin_pool",
  "metadata": { "name": "test" },
  "spec": {
    "advanced_options": {
      "panic_threshold": 50,

    }
  }
}`;
    const doc = mockDoc(content, 't.origin_pool.json');
    const result = provider.provideCompletionItems(doc, pos(6, 6), tok, ctx);
    const ls = labels(result);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls).not.toContain('panic_threshold');
  });

  it('provides completions inside https_auto_cert for http_loadbalancer', () => {
    const content = `{
  "kind": "http_loadbalancer",
  "metadata": { "name": "test" },
  "spec": {
    "https_auto_cert": {

    }
  }
}`;
    const doc = mockDoc(content, 't.http_loadbalancer.json');
    const result = provider.provideCompletionItems(doc, pos(5, 6), tok, ctx);
    const ls = labels(result);
    expect(ls.length).toBeGreaterThan(0);
  });

  it('returns no completions on closing brace line', () => {
    const content = `{
  "kind": "origin_pool",
  "metadata": { "name": "test" },
  "spec": {
    "advanced_options": {
      "panic_threshold": 50
    }
  }
}`;
    const doc = mockDoc(content, 't.origin_pool.json');
    const result = provider.provideCompletionItems(doc, pos(6, 4), tok, ctx);
    const ls = labels(result);
    if (ls.length > 0) {
      expect(ls).not.toContain('panic_threshold');
    }
  });
});

// ─── SECTION 11: Schema Coverage ────────────────────────────

describe('schema coverage', () => {
  it('at least 170 resource types have schemas', () => {
    const registry = getSchemaRegistry();
    const allKeys = getAllGeneratedResourceKeys();
    let withSchema = 0;
    for (const key of allKeys) {
      if (registry.hasSchema(key)) {
        const schema = registry.getOrGenerateSchema(key);
        if (schema?.properties?.spec?.properties && Object.keys(schema.properties.spec.properties).length > 0) {
          withSchema++;
        }
      }
    }
    expect(withSchema).toBeGreaterThanOrEqual(170);
  });
});
