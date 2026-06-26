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
 * Auth-env recognition shared with the xcsh shell via
 * `@f5-sales-demo/pi-utils/xcsh-env-names` — the single source of truth for
 * reserved control keys, the recognized web-console login credentials, and the
 * secret-detection rule. pi-utils ships ESM TypeScript; the extension compiles to
 * CommonJS and bundles it through the webpack `@f5-sales-demo` vendor rule, so
 * it is loaded with `require()` and described by local type shapes — the same
 * pattern `contextResolver.ts` uses.
 */
interface SharedEnvNamesModule {
  readonly XCSH_USERNAME: string;
  readonly XCSH_CONSOLE_PASSWORD: string;
  readonly AUTH_ENV_KEYS: readonly string[];
  readonly RESERVED_ENV_KEYS: ReadonlySet<string>;
  isSensitiveEnvKey(key: string): boolean;
  isInjectableContextEnvKey(key: string): boolean;
}

const sharedEnvNames = require('@f5-sales-demo/pi-utils/xcsh-env-names') as SharedEnvNamesModule;

/** Web-console login username key — a generic (non-reserved) env credential. */
export const XCSH_USERNAME = sharedEnvNames.XCSH_USERNAME;
/** Web-console login password key — a generic (non-reserved), sensitive env credential. */
export const XCSH_CONSOLE_PASSWORD = sharedEnvNames.XCSH_CONSOLE_PASSWORD;
/** Recognized web-console credentials, in display order (username, then password). */
export const AUTH_ENV_KEYS = sharedEnvNames.AUTH_ENV_KEYS;

/**
 * Control env vars owned by the context itself (apiUrl/apiToken/defaultNamespace)
 * or injected at activation. A context's custom `env` map must never set these —
 * they would be ignored or clobbered by the resolver. Shared with xcsh so both
 * hosts reject the same keys.
 */
export const RESERVED_ENV_KEYS = sharedEnvNames.RESERVED_ENV_KEYS;

/** True iff an env var NAME looks like it holds a secret (e.g. XCSH_CONSOLE_PASSWORD). */
export const isSensitiveEnvKey = (key: string): boolean => sharedEnvNames.isSensitiveEnvKey(key);

/**
 * True iff a context's `env` entry may be injected into a spawned subprocess.
 * Allowlist (default-deny): only XCSH_-namespaced, non-reserved keys. Project-local
 * context files are untrusted input, so anything outside the XCSH_ namespace
 * (LD_PRELOAD, NODE_OPTIONS, PATH, …) is refused and can never run code.
 */
export const isInjectableContextEnvKey = (key: string): boolean => sharedEnvNames.isInjectableContextEnvKey(key);

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A syntactically valid POSIX-style environment variable name. */
export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_PATTERN.test(key);
}

export function isReservedEnvKey(key: string): boolean {
  return RESERVED_ENV_KEYS.has(key);
}

/** Export-bundle format version — distinct from per-context XCSHContext.version. */
export const CURRENT_EXPORT_VERSION = 1;

/**
 * Portable bundle of contexts, byte-compatible with the xcsh shell's
 * `/context export|import`. When `tokensMasked` is true the bundle is for
 * sharing structure only and import must reject it (tokens are unusable).
 */
export interface ExportBundle {
  version: number;
  exportedAt: string;
  tokensMasked: boolean;
  contexts: XCSHContext[];
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
