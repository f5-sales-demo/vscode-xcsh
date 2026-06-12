import * as fs from 'node:fs';
import * as path from 'node:path';

const EXPECTED_LOCALES = ['en', 'fr', 'es', 'de', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'ar', 'it', 'hi', 'th'];

const l10nDir = path.resolve(__dirname, '..', '..', '..', 'l10n');

describe('i18n locale coverage', () => {
  test('l10n directory exists', () => {
    expect(fs.existsSync(l10nDir)).toBe(true);
  });

  test('base English bundle exists', () => {
    const file = path.join(l10nDir, 'bundle.l10n.json');
    expect(fs.existsSync(file)).toBe(true);
  });

  test('has a bundle file for every non-English locale', () => {
    const missing: string[] = [];
    for (const slug of EXPECTED_LOCALES) {
      if (slug === 'en') {
        continue;
      }
      const file = path.join(l10nDir, `bundle.l10n.${slug}.json`);
      if (!fs.existsSync(file)) {
        missing.push(slug);
      }
    }
    expect(missing).toEqual([]);
  });

  test('all bundle files are valid JSON', () => {
    for (const slug of EXPECTED_LOCALES) {
      if (slug === 'en') {
        continue;
      }
      const file = path.join(l10nDir, `bundle.l10n.${slug}.json`);
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      }
    }
  });
});
