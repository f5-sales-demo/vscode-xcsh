const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const merge = require('./index.cjs');

test('Jest resolves the hardened development dependency', () => {
  const fromJest = createRequire(require.resolve('jest'));
  for (const consumer of ['@jest/core', 'jest-cli']) {
    const fromConsumer = createRequire(fromJest.resolve(consumer));
    const fromConfig = createRequire(fromConsumer.resolve('jest-config'));
    assert.equal(fromConfig('deepmerge'), merge);
  }
});

test('target poisoning never changes the returned prototype', () => {
  const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
  const result = merge(malicious, {});
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(result, '__proto__'), true);
  assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__').value.polluted, true);
});

test('nested objects, arrays, null prototypes and all retain prototype safety', () => {
  const malicious = Object.assign(
    Object.create(null),
    JSON.parse('{"__proto__":{"polluted":true}}'),
  );
  const result = merge.all([{ nested: malicious, items: [malicious] }, { extra: true }]);
  for (const value of [result, result.nested, result.items[0]]) {
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(value.polluted, undefined);
  }
  assert.equal(result.extra, true);
  assert.equal(Object.getPrototypeOf(malicious), null);
});

test('source poisoning and inherited properties are not merged', () => {
  const source = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');
  const result = merge({}, source);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.polluted, undefined);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(result.safe, 1);
  assert.deepEqual(merge({}, Object.assign(Object.create({ inherited: true }), { safe: 2 })), {
    safe: 2,
  });
});

test('destination writes never execute inherited setters', () => {
  let calls = 0;
  Object.defineProperty(Object.prototype, 'deepmergeSetterProbe', {
    configurable: true,
    set() {
      calls++;
    },
  });
  try {
    const target = Object.defineProperty({}, 'deepmergeSetterProbe', {
      value: 7,
      enumerable: true,
    });
    const result = merge(target, {});
    assert.equal(calls, 0);
    assert.equal(result.deepmergeSetterProbe, 7);
  } finally {
    delete Object.prototype.deepmergeSetterProbe;
  }
});

test('Jest globals and all preserve recursive merging without input mutations', () => {
  const first = { globals: { flags: { a: true }, values: [1] } };
  const second = { globals: { flags: { b: true }, values: [2] } };
  const result = merge.all([first, second]);
  assert.deepEqual(result, { globals: { flags: { a: true, b: true }, values: [1, 2] } });
  result.globals.values.push(3);
  assert.deepEqual(first.globals.values, [1]);
  assert.deepEqual(second.globals.values, [2]);
  assert.throws(() => merge.all({}), /first argument should be an array/);
});

test('symbols, special objects, clone and custom merging options remain compatible', () => {
  const symbol = Symbol('config');
  const date = new Date(0);
  const regex = /test/;
  const result = merge({ [symbol]: { a: 1 }, date }, { [symbol]: { b: 2 }, regex });
  assert.deepEqual(result[symbol], { a: 1, b: 2 });
  assert.equal(result.date, date);
  assert.equal(result.regex, regex);
  const shared = { a: 1 };
  assert.equal(merge({}, { shared }, { clone: false }).shared, shared);
  assert.deepEqual(merge([1], [2], { arrayMerge: (_target, source) => source }), [2]);
  const custom = merge(
    { flags: { a: true } },
    { flags: { b: true } },
    {
      customMerge: (key) => (key === 'flags' ? () => ({ custom: true }) : undefined),
    },
  );
  assert.deepEqual(custom, { flags: { custom: true } });
});
