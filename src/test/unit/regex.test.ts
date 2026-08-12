// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { escapeRegExp } from '../../utils/regex';

describe('escapeRegExp', () => {
  it('escapes every JavaScript regular-expression metacharacter', () => {
    const literal = 'field.*+?^${}()|[]\\\\name';
    const pattern = new RegExp(`^${escapeRegExp(literal)}$`);

    expect(pattern.test(literal)).toBe(true);
    expect(pattern.test('fieldZZname')).toBe(false);
  });
});
