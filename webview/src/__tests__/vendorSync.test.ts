// webview/src/__tests__/vendorSync.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Drift guard for the vendored `@f5-sales-demo/xcsh-chat-ui` copy. The vendored
// tree under webview/src/vendored/chat-ui must byte-match its VENDOR-MANIFEST.json
// sha256 hashes, and must contain no stray `.ts`/`.tsx` source not listed in the
// manifest. Re-vendor (not hand-edit) when the shared library changes.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const VENDOR_DIR = join(__dirname, '..', 'vendored', 'chat-ui');
const MANIFEST_PATH = join(VENDOR_DIR, 'VENDOR-MANIFEST.json');

interface Manifest {
  generatedFrom: string;
  files: Record<string, string>;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Recursively collect vendored `.ts`/`.tsx` source files, skipping `.test.` files. */
function walkSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      walkSources(abs, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
      acc.push(abs);
    }
  }
  return acc;
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;

describe('vendored chat-ui sync', () => {
  it('matches every manifest hash byte-for-byte', () => {
    for (const [rel, expected] of Object.entries(manifest.files)) {
      const actual = sha256(join(VENDOR_DIR, rel));
      expect(`${rel}:${actual}`).toBe(`${rel}:${expected}`);
    }
  });

  it('has no stray source files missing from the manifest', () => {
    const listed = new Set(Object.keys(manifest.files));
    const stray = walkSources(VENDOR_DIR)
      .map((abs) => relative(VENDOR_DIR, abs).split('\\').join('/'))
      .filter((rel) => !listed.has(rel));
    expect(stray).toEqual([]);
  });
});
