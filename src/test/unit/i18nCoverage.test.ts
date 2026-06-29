import * as fs from 'node:fs';
import * as path from 'node:path';

const EXPECTED_LOCALES = ['en', 'fr', 'es', 'de', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'ar', 'it', 'hi', 'th'];

const l10nDir = path.resolve(__dirname, '..', '..', '..', 'l10n');
const nlsDir = path.resolve(__dirname, '..', '..', '..');

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

  test('every locale bundle has all keys from the English base', () => {
    const baseFile = path.join(l10nDir, 'bundle.l10n.json');
    const baseKeys = Object.keys(JSON.parse(fs.readFileSync(baseFile, 'utf-8')));

    for (const slug of EXPECTED_LOCALES) {
      if (slug === 'en') {
        continue;
      }
      const file = path.join(l10nDir, `bundle.l10n.${slug}.json`);
      if (!fs.existsSync(file)) {
        continue;
      }

      const localeKeys = Object.keys(JSON.parse(fs.readFileSync(file, 'utf-8')));
      const missing = baseKeys.filter((k) => !localeKeys.includes(k));

      expect(missing).toEqual([]);
    }
  });

  test('explicit resource type displayNames have keys in the English l10n bundle', () => {
    const baseFile = path.join(l10nDir, 'bundle.l10n.json');
    const bundleKeys = new Set(Object.keys(JSON.parse(fs.readFileSync(baseFile, 'utf-8'))));

    const resourceTypesFile = path.resolve(__dirname, '..', '..', 'api', 'resourceTypes.ts');
    const source = fs.readFileSync(resourceTypesFile, 'utf-8');
    const displayNameRegex = /displayName:\s*'([^']+)'/g;
    const matches = source.matchAll(displayNameRegex);
    const missing: string[] = [];
    for (const match of matches) {
      const name = match[1] as string;
      if (!bundleKeys.has(name)) {
        missing.push(name);
      }
    }

    expect(missing).toEqual([]);
  });

  test('every locale package.nls file has all keys from the English base', () => {
    const baseFile = path.join(nlsDir, 'package.nls.json');
    const baseKeys = Object.keys(JSON.parse(fs.readFileSync(baseFile, 'utf-8')));

    for (const slug of EXPECTED_LOCALES) {
      if (slug === 'en') {
        continue;
      }
      const file = path.join(nlsDir, `package.nls.${slug}.json`);
      if (!fs.existsSync(file)) {
        continue;
      }

      const localeKeys = Object.keys(JSON.parse(fs.readFileSync(file, 'utf-8')));
      const missing = baseKeys.filter((k) => !localeKeys.includes(k));

      expect({ locale: slug, missing }).toEqual({ locale: slug, missing: [] });
    }
  });
});
