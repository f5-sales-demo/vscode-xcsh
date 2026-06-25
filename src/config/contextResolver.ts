// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Three-tier context resolution for the VS Code extension.
 *
 * Priority:
 *   1. Environment variables  (XCSH_API_URL + XCSH_API_TOKEN)
 *   2. Local workspace dir    ({workspaceFolder}/.xcsh/contexts/)
 *   3. Global config dir      (~/.config/xcsh/contexts/)
 *
 * A local context file may be:
 *   - **inline** — a full XCSHContext JSON (`{ apiUrl, … }`)
 *   - **pointer** — `{ context: "<globalName>", overrides?: … }` that
 *     references a global context and optionally merges overrides.
 *
 * This duplicates the algorithm from `packages/utils/src/xcsh-context-resolver.ts`
 * because the VS Code extension is a separate repo and cannot import from
 * packages/utils.  Uses Node.js APIs (not Bun).
 */

import * as fs from 'node:fs';
import {
  getActiveContextPath,
  getContextPath,
  getContextsDir,
  getLocalActiveContextPath,
  getLocalContextPath,
  getLocalContextsDir,
} from './contextPaths';
import { isValidContextName, type XCSHContext } from './contextTypes';

// ───────── public types ─────────

export interface ContextOverrides {
  defaultNamespace?: string;
  env?: Record<string, string>;
  sensitiveKeys?: string[];
  knowledgeSources?: Array<{ url: string; label?: string; type?: string }>;
  includeSkills?: string[];
  excludeSkills?: string[];
}

export interface PointerContext {
  context: string;
  overrides?: ContextOverrides;
}

export type ContextSource = 'env' | 'local' | 'global';

export interface ResolvedContext {
  context: XCSHContext;
  source: ContextSource;
  sourcePath: string;
}

// ───────── detection helpers ─────────

export function isPointerContext(data: unknown): data is PointerContext {
  if (data === null || data === undefined || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.context === 'string' && !('apiUrl' in obj);
}

export function isInlineContext(data: unknown): boolean {
  if (data === null || data === undefined || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.apiUrl === 'string';
}

// ───────── merge ─────────

export function mergePointerOverrides(base: XCSHContext, overrides: ContextOverrides): XCSHContext {
  const merged = { ...base };

  if (overrides.defaultNamespace !== undefined) {
    merged.defaultNamespace = overrides.defaultNamespace;
  }
  if (overrides.sensitiveKeys !== undefined) {
    merged.sensitiveKeys = overrides.sensitiveKeys;
  }
  if (overrides.knowledgeSources !== undefined) {
    merged.knowledgeSources = overrides.knowledgeSources as XCSHContext['knowledgeSources'];
  }
  if (overrides.includeSkills !== undefined) {
    merged.includeSkills = overrides.includeSkills;
  }
  if (overrides.excludeSkills !== undefined) {
    merged.excludeSkills = overrides.excludeSkills;
  }
  if (overrides.env !== undefined) {
    merged.env = { ...base.env, ...overrides.env };
  }

  return merged;
}

// ───────── private I/O helpers ─────────

function readActivePointer(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const name = fs.readFileSync(filePath, 'utf-8').trim();
    return name || null;
  } catch {
    return null;
  }
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ───────── tier resolvers ─────────

function resolveFromLocal(workspaceFolder: string): ResolvedContext | null {
  const contextsDir = getLocalContextsDir(workspaceFolder);
  if (!fs.existsSync(contextsDir)) {
    return null;
  }

  const activeContextPath = getLocalActiveContextPath(workspaceFolder);
  const activeName = readActivePointer(activeContextPath);
  if (!activeName || !isValidContextName(activeName)) {
    return null;
  }

  const contextPath = getLocalContextPath(activeName, workspaceFolder);
  const data = readJsonFile(contextPath);
  if (!data) {
    return null;
  }

  if (isPointerContext(data)) {
    return resolvePointer(data, contextPath);
  }

  if (isInlineContext(data)) {
    return {
      context: data as unknown as XCSHContext,
      source: 'local',
      sourcePath: contextPath,
    };
  }

  return null;
}

function resolveFromGlobal(): ResolvedContext | null {
  const contextsDir = getContextsDir();
  if (!fs.existsSync(contextsDir)) {
    return null;
  }

  const activeContextPath = getActiveContextPath();
  const activeName = readActivePointer(activeContextPath);
  if (!activeName || !isValidContextName(activeName)) {
    return null;
  }

  const contextPath = getContextPath(activeName);
  const data = readJsonFile(contextPath);
  if (!data) {
    return null;
  }

  if (isPointerContext(data)) {
    return resolvePointer(data, contextPath);
  }

  if (isInlineContext(data)) {
    return {
      context: data as unknown as XCSHContext,
      source: 'global',
      sourcePath: contextPath,
    };
  }

  return null;
}

function resolvePointer(pointer: PointerContext, pointerPath: string): ResolvedContext | null {
  if (!isValidContextName(pointer.context)) {
    return null;
  }
  const globalPath = getContextPath(pointer.context);
  const globalData = readJsonFile(globalPath);
  if (!globalData) {
    return null;
  }

  let resolved = globalData as unknown as XCSHContext;
  if (pointer.overrides) {
    resolved = mergePointerOverrides(resolved, pointer.overrides);
  }

  return {
    context: resolved,
    source: 'local',
    sourcePath: pointerPath,
  };
}

// ───────── main entry point ─────────

/**
 * Resolve the active F5 XC context using three-tier precedence:
 *   1. Environment variables (XCSH_API_URL + XCSH_API_TOKEN)
 *   2. Local workspace `.xcsh/contexts/`
 *   3. Global `~/.config/xcsh/contexts/`
 */
export function resolveContext(workspaceFolder: string | undefined): Promise<ResolvedContext | null> {
  // Priority 1: environment variables
  const envUrl = process.env.XCSH_API_URL;
  const envToken = process.env.XCSH_API_TOKEN;
  if (envUrl && envToken) {
    return Promise.resolve({
      context: {
        name: '(env)',
        apiUrl: envUrl,
        apiToken: envToken,
        defaultNamespace: process.env.XCSH_NAMESPACE ?? 'system',
      },
      source: 'env',
      sourcePath: 'environment variables',
    });
  }

  // Priority 2: local workspace
  if (workspaceFolder) {
    const localResult = resolveFromLocal(workspaceFolder);
    if (localResult) {
      return Promise.resolve(localResult);
    }
  }

  // Priority 3: global config
  return Promise.resolve(resolveFromGlobal());
}
