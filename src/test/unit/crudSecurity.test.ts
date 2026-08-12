// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { setNestedValue } from '../../utils/objectPath';

describe('setNestedValue', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('rejects unsafe path component %s', (component) => {
    const target: Record<string, unknown> = {};

    expect(() => setNestedValue(target, `safe.${component}.polluted`, true)).toThrow('Unsafe object path');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('creates own nested properties without changing object prototypes', () => {
    const target: Record<string, unknown> = {};

    setNestedValue(target, 'spec.monitoring.enabled', true);

    expect(target).toEqual({ spec: { monitoring: { enabled: true } } });
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
  });

  it('rejects empty path components', () => {
    expect(() => setNestedValue({}, 'spec..enabled', true)).toThrow('Unsafe object path');
  });
});
