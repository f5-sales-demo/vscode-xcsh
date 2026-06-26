import * as fs from 'node:fs';
import * as path from 'node:path';
import { SLUG_LIST } from '@f5-sales-demo/i18n-core';

const slugs = SLUG_LIST;
const l10nDir = path.resolve(import.meta.dirname, '..', 'l10n');
const missing: string[] = [];

for (const slug of slugs) {
  if (slug === 'en') {
    continue;
  }
  const file = path.join(l10nDir, `bundle.l10n.${slug}.json`);
  if (!fs.existsSync(file)) {
    missing.push(slug);
  }
}

if (missing.length > 0) {
  console.error(`Missing l10n bundles for: ${missing.join(', ')}`);
  process.exit(1);
} else {
  console.log(`All ${slugs.length - 1} non-English locale bundles present.`);
}
