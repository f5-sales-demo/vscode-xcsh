// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as vscode from 'vscode';
import type { XCSHClient } from '../api/client';

export interface XCSHContext {
  name: string;
  apiUrl: string;
  apiToken: string;
  defaultNamespace: string;
  env?: Record<string, string>;
  sensitiveKeys?: string[];
  knowledgeSources?: KnowledgeSource[];
  includeSkills?: string[];
  excludeSkills?: string[];
  version?: number;
  metadata?: ContextMetadata;
}

export interface KnowledgeSource {
  url: string;
  label?: string;
  type?: 'llms-txt' | 'skill-dir' | 'docs-site';
}

export interface ContextMetadata {
  createdAt?: string;
  expiresAt?: string;
  lastRotatedAt?: string;
  rotateAfterDays?: number;
}

export type TokenHealth = 'ok' | 'expiring' | 'expired';
export type AuthStatus = 'connected' | 'auth_error' | 'offline' | 'unknown';

export interface ContextManagerInterface {
  getActiveContext(): Promise<XCSHContext | null>;
  getContexts(): Promise<XCSHContext[]>;
  getClient(contextName: string): Promise<XCSHClient>;
  onDidChangeContext: vscode.Event<void>;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const RESERVED_CONTEXT_NAMES = new Set([
  'list',
  'show',
  'status',
  'create',
  'delete',
  'rename',
  'namespace',
  'env',
  'set',
  'unset',
  'add',
  'remove',
  'clear',
  'activate',
  'validate',
  'export',
  'import',
  'wizard',
  'help',
]);

const CONTEXT_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidContextName(name: string): boolean {
  if (!CONTEXT_NAME_PATTERN.test(name)) {
    return false;
  }
  return !RESERVED_CONTEXT_NAMES.has(name.toLowerCase());
}

/**
 * Control env vars owned by the context itself (apiUrl/apiToken/defaultNamespace)
 * or injected at activation. A context's custom `env` map must never set these —
 * they would be ignored or clobbered by the resolver. Mirrors xcsh's
 * RESERVED_ENV_KEYS so both hosts reject the same keys.
 */
export const RESERVED_ENV_KEYS: ReadonlySet<string> = new Set([
  'XCSH_NAMESPACE',
  'XCSH_API_URL',
  'XCSH_API_TOKEN',
  'XCSH_TENANT',
  'XCSH_CONTEXT_NAME',
]);

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A syntactically valid POSIX-style environment variable name. */
export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_PATTERN.test(key);
}

export function isReservedEnvKey(key: string): boolean {
  return RESERVED_ENV_KEYS.has(key);
}

export function maskToken(token: string): string {
  if (token.length <= 4) {
    return '****';
  }
  return `...${token.slice(-4)}`;
}

export function computeTokenHealth(expiresAt: string | undefined): TokenHealth {
  if (!expiresAt) {
    return 'ok';
  }
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  if (expiry <= now) {
    return 'expired';
  }
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (expiry - now <= sevenDays) {
    return 'expiring';
  }
  return 'ok';
}

/**
 * Normalize an API URL to its origin (`https://host[:port]`) — the canonical
 * stored form for a context endpoint.
 *
 * The stored value must be the bare origin only: no path, query, fragment, or
 * trailing slash. Callers append `/api/...` (and any other path patterns)
 * themselves when making requests, so the endpoint stays a single consistent
 * value that other tooling (e.g. the xcsh CLI, or a browser-automation login
 * URL that cannot carry a suffix) can reuse.
 *
 * This also defuses the protocol-relative host collapse: a pasted browser URL
 * (e.g. `https://host/web/home?iss=...`) or a trailing slash would otherwise
 * survive and corrupt the shared library's `${apiUrl}${path}` join, where a
 * leading `//` in the result is parsed by `new URL()` as an authority and
 * collapses the request host to a bare label (e.g. `api`).
 */
export function normalizeApiUrl(apiUrl: string): string {
  if (typeof apiUrl !== 'string') {
    return apiUrl;
  }
  const trimmed = apiUrl.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    // Not a parseable absolute URL (input validation should prevent this);
    // fall back to stripping trailing slashes so we never worsen a bad value.
    return trimmed.replace(/\/+$/, '');
  }
}

export function deriveTenantFromUrl(apiUrl: string): string | null {
  try {
    const hostname = new URL(apiUrl).hostname;
    const parts = hostname.split('.');
    if (parts.length < 2) {
      return null;
    }
    const first = parts[0];
    return first !== undefined ? first.toLowerCase() : null;
  } catch {
    return null;
  }
}
