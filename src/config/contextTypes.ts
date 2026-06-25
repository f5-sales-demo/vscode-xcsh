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
