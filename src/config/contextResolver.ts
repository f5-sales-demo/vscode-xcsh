// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Three-tier context resolution for the VS Code extension.
 *
 * Priority:
 *   1. Environment variables  (XCSH_API_URL + XCSH_API_TOKEN)
 *   2. Local workspace dir    ({workspaceFolder}/.xcsh/contexts/)
 *   3. Global config dir       (~/.config/xcsh/contexts/)
 *
 * The resolution algorithm itself lives in the shared, host-agnostic
 * `@f5xc-salesdemos/pi-utils` `ContextResolver` so the extension and the xcsh
 * shell resolve contexts identically (precedence, pointer/inline detection,
 * both/neither + inline-field validation, reserved-name rejection,
 * git-tracking). This module injects the extension's own path provider and keeps
 * the public `resolveContext` surface its callers already use.
 *
 * pi-utils ships ESM TypeScript source; the extension compiles to CommonJS and
 * bundles it via the webpack `@f5xc-salesdemos` vendor rule, so the module is
 * loaded with `require()` and described by local type shapes — the same pattern
 * `specBridge.ts` / `resourceService.ts` use for `pi-resource-management`. The
 * type shapes mirror the resolver's public surface; the Phase-4 parity test
 * guards them against drift.
 */

import {
  getActiveContextPath,
  getContextPath,
  getContextsDir,
  getLocalActiveContextPath,
  getLocalContextPath,
  getLocalContextsDir,
} from './contextPaths';
import type { XCSHContext } from './contextTypes';

// ───────── public types (mirror @f5xc-salesdemos/pi-utils/xcsh-context-resolver) ─────────

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

interface ContextPathProvider {
  getContextsDir(): string;
  getActiveContextPath(): string;
  getContextPath(name: string): string;
  getLocalContextsDir(cwd: string): string;
  getLocalActiveContextPath(cwd: string): string;
  getLocalContextPath(name: string, cwd: string): string;
}

interface ContextResolverInstance {
  resolve(cwd: string): Promise<ResolvedContext | null>;
  findLocalContextsDir(cwd: string): string | null;
  checkGitTracking(filePath: string): Promise<boolean>;
}

interface SharedResolverModule {
  ContextResolver: new (deps: {
    paths: ContextPathProvider;
    gitTracker?: (filePath: string) => Promise<boolean>;
  }) => ContextResolverInstance;
  isPointerContext(data: unknown): data is PointerContext;
  isInlineContext(data: unknown): boolean;
  mergePointerOverrides(base: XCSHContext, overrides: ContextOverrides): XCSHContext;
}

const shared = require('@f5xc-salesdemos/pi-utils/xcsh-context-resolver') as SharedResolverModule;

// Re-export the shared detection/merge helpers (thin wrappers so the standalone
// functions aren't flagged as unbound methods) so existing importers
// (contextManager, contextProvider, tests) keep their `./contextResolver` paths.
export const isPointerContext = (data: unknown): data is PointerContext => shared.isPointerContext(data);
export const isInlineContext = (data: unknown): boolean => shared.isInlineContext(data);
export const mergePointerOverrides = (base: XCSHContext, overrides: ContextOverrides): XCSHContext =>
  shared.mergePointerOverrides(base, overrides);

/** The extension's path provider, wired to `contextPaths.ts` (`~/.config/xcsh`). */
const vscodePaths: ContextPathProvider = {
  getContextsDir,
  getActiveContextPath,
  getContextPath,
  getLocalContextsDir: (cwd) => getLocalContextsDir(cwd),
  getLocalActiveContextPath: (cwd) => getLocalActiveContextPath(cwd),
  getLocalContextPath: (name, cwd) => getLocalContextPath(name, cwd),
};

const resolver = new shared.ContextResolver({ paths: vscodePaths });

/**
 * Resolve the active context using the shared three-tier algorithm. When no
 * workspace folder is open the local tier finds nothing and resolution falls
 * through to env/global. The shared resolver already normalizes the resolved
 * `apiUrl` to its origin (pi-utils >= 19.46.0), so there is no host-level
 * post-process here — normalization has a single source.
 */
export async function resolveContext(workspaceFolder: string | undefined): Promise<ResolvedContext | null> {
  return resolver.resolve(workspaceFolder ?? '');
}

/**
 * Report whether a context file is tracked by git (it may then contain
 * credentials). Delegates to the shared resolver's `node:child_process` check.
 */
export function checkGitTracking(filePath: string): Promise<boolean> {
  return resolver.checkGitTracking(filePath);
}
