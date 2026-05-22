// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import {
  computeTokenHealth,
  deriveTenantFromUrl,
  isValidContextName,
  maskToken,
  RESERVED_CONTEXT_NAMES,
} from '../../config/contextTypes';

describe('Context name validation', () => {
  it('accepts valid alphanumeric names', () => {
    expect(isValidContextName('production')).toBe(true);
    expect(isValidContextName('my-tenant')).toBe(true);
    expect(isValidContextName('test_123')).toBe(true);
    expect(isValidContextName('A')).toBe(true);
  });

  it('rejects empty names', () => {
    expect(isValidContextName('')).toBe(false);
  });

  it('rejects names longer than 64 characters', () => {
    expect(isValidContextName('a'.repeat(64))).toBe(true);
    expect(isValidContextName('a'.repeat(65))).toBe(false);
  });

  it('rejects names with invalid characters', () => {
    expect(isValidContextName('has space')).toBe(false);
    expect(isValidContextName('has.dot')).toBe(false);
    expect(isValidContextName('has/slash')).toBe(false);
    expect(isValidContextName('../traversal')).toBe(false);
  });

  it('rejects reserved names (case-insensitive)', () => {
    expect(isValidContextName('list')).toBe(false);
    expect(isValidContextName('LIST')).toBe(false);
    expect(isValidContextName('Create')).toBe(false);
    expect(isValidContextName('delete')).toBe(false);
    expect(isValidContextName('namespace')).toBe(false);
    expect(isValidContextName('wizard')).toBe(false);
    expect(isValidContextName('help')).toBe(false);
  });

  it('RESERVED_CONTEXT_NAMES set contains expected entries', () => {
    expect(RESERVED_CONTEXT_NAMES.has('list')).toBe(true);
    expect(RESERVED_CONTEXT_NAMES.has('wizard')).toBe(true);
    expect(RESERVED_CONTEXT_NAMES.has('help')).toBe(true);
  });
});

describe('Token masking', () => {
  it('masks tokens showing last 4 characters', () => {
    expect(maskToken('abcdefghijklmnop')).toBe('...mnop');
  });

  it('fully masks short tokens', () => {
    expect(maskToken('abcd')).toBe('****');
    expect(maskToken('ab')).toBe('****');
  });

  it('handles empty token', () => {
    expect(maskToken('')).toBe('****');
  });
});

describe('Token health computation', () => {
  it('returns "ok" when expiry is more than 7 days away', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeTokenHealth(futureDate)).toBe('ok');
  });

  it('returns "expiring" when expiry is within 7 days', () => {
    const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeTokenHealth(soonDate)).toBe('expiring');
  });

  it('returns "expired" when expiry is in the past', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    expect(computeTokenHealth(pastDate)).toBe('expired');
  });

  it('returns "ok" when no expiry date provided', () => {
    expect(computeTokenHealth(undefined)).toBe('ok');
  });
});

describe('deriveTenantFromUrl', () => {
  it('extracts first hostname label from a valid F5 XC console URL', () => {
    expect(deriveTenantFromUrl('https://acme.console.ves.volterra.io')).toBe('acme');
  });

  it('returns null for a dotless hostname', () => {
    expect(deriveTenantFromUrl('https://localhost')).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    expect(deriveTenantFromUrl('not-a-url')).toBeNull();
  });
});
