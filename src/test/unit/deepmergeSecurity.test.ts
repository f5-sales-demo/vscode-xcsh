import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const load = createRequire(join(root, 'package.json'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, unknown>;
};
const locations = Object.keys(lock.packages).filter((path) => path.endsWith('/deepmerge'));
interface Merge {
  (target: unknown, source: unknown, options?: Record<string, unknown>): Record<string, unknown>;
  all(values: unknown[]): Record<string, unknown>;
}

test('security regressions cover at least one actual installed deepmerge resolution', () => {
  expect(locations.length).toBeGreaterThan(0);
});

for (const location of locations) {
  describe(`installed ${location}`, () => {
    const merge = load(join(root, location)) as Merge;
    const payload = () => JSON.parse('{"__proto__":{"admin":true}}');

    test.each([
      ['null-prototype target', () => merge(Object.create(null), payload())],
      ['nested null placeholder', () => merge({ session: null }, { session: payload() }).session],
      ['own prototype key in target', () => merge(payload(), {})],
      ['array element clone', () => (merge({}, { items: [payload()] }).items as unknown[])[0]],
    ] as const)('does not inherit attacker data from %s', (_name, observe) => {
      const result = observe() as Record<string, unknown>;
      expect(result.admin).toBeUndefined();
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.hasOwn(result, 'admin')).toBe(false);
      expect(({} as Record<string, unknown>).admin).toBeUndefined();
    });

    test('preserves safe recursive merge, array concatenation, cloning and all', () => {
      const left = { nested: { left: true }, items: [{ left: true }] };
      const right = { nested: { right: true }, items: [{ right: true }] };
      const result = merge(left, right);
      expect(result).toEqual({
        nested: { left: true, right: true },
        items: [{ left: true }, { right: true }],
      });
      expect(result.nested).not.toBe(left.nested);
      expect((result.items as unknown[])[0]).not.toBe(left.items[0]);
      expect(merge.all([left, right])).toEqual(result);
      expect(left).toEqual({ nested: { left: true }, items: [{ left: true }] });
    });

    test('preserves Jest configuration array override semantics', () => {
      expect(
        merge(
          { values: ['before'] },
          { values: ['after'] },
          {
            arrayMerge: (_target: unknown[], source: unknown[]) => source,
          },
        ),
      ).toEqual({ values: ['after'] });
    });
  });
}
