// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import {
  computeTokenHealth,
  deriveTenantFromUrl,
  isValidContextName,
  maskToken,
  normalizeApiUrl,
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

describe('normalizeApiUrl', () => {
  it('reduces an origin-only URL to itself (idempotent)', () => {
    expect(normalizeApiUrl('https://tenant.console.ves.volterra.io')).toBe('https://tenant.console.ves.volterra.io');
  });

  it('strips a trailing slash', () => {
    expect(normalizeApiUrl('https://host.example.com/')).toBe('https://host.example.com');
  });

  it('strips an /api path suffix to the origin', () => {
    expect(normalizeApiUrl('https://host.example.com/api')).toBe('https://host.example.com');
    expect(normalizeApiUrl('https://host.example.com/api/')).toBe('https://host.example.com');
  });

  it('strips an arbitrary path, query, and fragment to the origin', () => {
    expect(normalizeApiUrl('https://host.example.com/web/home?iss=x#frag')).toBe('https://host.example.com');
  });

  // The real-world report: a full console/browser URL pasted into the API URL field.
  it('reduces a pasted full browser URL to its origin', () => {
    const pasted =
      'https://f5-amer-ent.console.ves.volterra.io/web/home?iss=https%3A%2F%2Flogin.ves.volterra.io%2Fauth%2Frealms%2Ff5-amer-ent-x';
    expect(normalizeApiUrl(pasted)).toBe('https://f5-amer-ent.console.ves.volterra.io');
  });

  it('preserves a non-default port', () => {
    expect(normalizeApiUrl('https://host.example.com:9443/api')).toBe('https://host.example.com:9443');
  });

  it('falls back to trailing-slash stripping for an unparseable value', () => {
    expect(normalizeApiUrl('not-a-url/')).toBe('not-a-url');
  });

  // With an origin-only result there is no path that can produce a `//`, so the
  // protocol-relative host collapse is structurally impossible.
  it('yields an origin that cannot collapse the request host', () => {
    const apiUrl = normalizeApiUrl('https://api.example.com/web/home?iss=x');
    const url = new URL(`${apiUrl}/api/config/namespaces/system/x`.slice(apiUrl.length), apiUrl);
    expect(url.host).toBe('api.example.com');
  });
});
