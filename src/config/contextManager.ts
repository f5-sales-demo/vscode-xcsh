// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TokenAuthProvider } from '../api/auth/tokenAuth';
import { XCSHClient } from '../api/client';
import { getLogger } from '../utils/logger';
import {
  DIR_MODE,
  FILE_MODE,
  getActiveContextPath,
  getConfigDir,
  getContextPath,
  getContextsDir,
  getLocalActiveContextPath,
  getLocalContextPath,
  getLocalContextsDir,
} from './contextPaths';
import type { ContextOverrides, PointerContext } from './contextResolver';
import {
  type ContextManagerInterface,
  CURRENT_SCHEMA_VERSION,
  computeTokenHealth,
  isReservedEnvKey,
  isValidContextName,
  isValidEnvKey,
  normalizeApiUrl,
  type TokenHealth,
  type XCSHContext,
} from './contextTypes';

/**
 * Manages F5 XC context files stored in ~/.config/xcsh/contexts/.
 *
 * Implements atomic writes (write-to-tmp then rename), 0o600 file
 * permissions, and caches XCSHClient / TokenAuthProvider instances
 * per context.  A file-system watcher fires `onDidChangeContext`
 * when contexts are modified externally (e.g., by xcsh).
 */
export class ContextManager implements ContextManagerInterface, vscode.Disposable {
  private readonly logger = getLogger();
  private readonly clientCache = new Map<string, XCSHClient>();
  private readonly authCache = new Map<string, TokenAuthProvider>();

  private readonly _onDidChangeContext = new vscode.EventEmitter<void>();
  readonly onDidChangeContext: vscode.Event<void> = this._onDidChangeContext.event;

  private fileWatcher: vscode.Disposable | undefined;
  private localFileWatcher: vscode.Disposable | undefined;

  // ───────── directory helpers ─────────

  /** Ensure the contexts directory exists with 0o700 permissions. */
  private ensureContextsDir(): void {
    const dir = getContextsDir();
    const configRoot = getConfigDir();

    // Ensure parent config dir
    if (!fs.existsSync(configRoot)) {
      fs.mkdirSync(configRoot, { recursive: true, mode: DIR_MODE });
    }
    this.chmodSafe(configRoot, DIR_MODE);

    // Ensure contexts sub-dir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    }
    this.chmodSafe(dir, DIR_MODE);
  }

  /** Chmod a path, ignoring errors on Windows. */
  private chmodSafe(p: string, mode: number): void {
    try {
      fs.chmodSync(p, mode);
    } catch {
      /* Windows may not support chmod */
    }
  }

  // ───────── atomic file I/O ─────────

  /**
   * Write data to `filePath` atomically: write to a `.tmp` sibling
   * then rename into place.  Sets permissions to `mode`.
   */
  private atomicWrite(filePath: string, data: string, mode: number): void {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode });
    fs.renameSync(tmp, filePath);
    // Ensure final permissions (rename may not preserve them on all OSes)
    this.chmodSafe(filePath, mode);
  }

  /**
   * Strip trailing slash(es) from a context's apiUrl. Applied on both read and write
   * so freshly saved files are clean and pre-existing files self-heal in memory; a
   * trailing slash otherwise collapses the request host to a bare label. See
   * `normalizeApiUrl`.
   */
  private normalizeContext(ctx: XCSHContext): XCSHContext {
    const normalized = normalizeApiUrl(ctx.apiUrl);
    return normalized === ctx.apiUrl ? ctx : { ...ctx, apiUrl: normalized };
  }

  // ───────── read operations ─────────

  getContexts(): Promise<XCSHContext[]> {
    const dir = getContextsDir();
    if (!fs.existsSync(dir)) {
      return Promise.resolve([]);
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const contexts: XCSHContext[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const ctx = JSON.parse(raw) as XCSHContext;
        contexts.push(this.normalizeContext(ctx));
      } catch (err) {
        this.logger.warn(`Skipping unreadable context file: ${file}`, err);
      }
    }

    contexts.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(contexts);
  }

  getContext(name: string): Promise<XCSHContext | null> {
    const filePath = getContextPath(name);
    if (!fs.existsSync(filePath)) {
      return Promise.resolve(null);
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return Promise.resolve(this.normalizeContext(JSON.parse(raw) as XCSHContext));
    } catch {
      return Promise.resolve(null);
    }
  }

  getActiveContextName(): Promise<string | null> {
    const p = getActiveContextPath();
    if (!fs.existsSync(p)) {
      return Promise.resolve(null);
    }
    try {
      const name = fs.readFileSync(p, 'utf-8').trim();
      return Promise.resolve(name || null);
    } catch {
      return Promise.resolve(null);
    }
  }

  async getActiveContext(): Promise<XCSHContext | null> {
    const name = await this.getActiveContextName();
    if (!name) {
      return null;
    }
    return this.getContext(name);
  }

  // ───────── write operations ─────────

  async addContext(ctx: XCSHContext): Promise<void> {
    if (!isValidContextName(ctx.name)) {
      throw new Error(`Invalid context name: "${ctx.name}"`);
    }

    this.ensureContextsDir();

    const filePath = getContextPath(ctx.name);
    if (fs.existsSync(filePath)) {
      throw new Error(`Context "${ctx.name}" already exists`);
    }

    const toWrite: XCSHContext = {
      ...this.normalizeContext(ctx),
      version: ctx.version ?? CURRENT_SCHEMA_VERSION,
    };

    this.atomicWrite(filePath, `${JSON.stringify(toWrite, null, 2)}\n`, FILE_MODE);

    // Auto-activate if this is the first context
    const all = await this.getContexts();
    if (all.length === 1) {
      this.setActiveContextInternal(ctx.name);
    }

    this._onDidChangeContext.fire();
  }

  async updateContext(name: string, updates: Partial<XCSHContext>): Promise<void> {
    const existing = await this.getContext(name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }

    const merged: XCSHContext = this.normalizeContext({ ...existing, ...updates, name });

    this.ensureContextsDir();
    this.atomicWrite(getContextPath(name), `${JSON.stringify(merged, null, 2)}\n`, FILE_MODE);

    // Clear caches for this context
    this.clearCacheFor(name);
    this._onDidChangeContext.fire();
  }

  /**
   * Set (or overwrite) one custom env var on a context. Rejects reserved control
   * keys and malformed names so the stored `env` map stays valid and never
   * shadows resolver-managed variables.
   */
  async setContextEnv(name: string, key: string, value: string): Promise<void> {
    if (!isValidEnvKey(key)) {
      throw new Error(`Invalid environment variable name: "${key}"`);
    }
    if (isReservedEnvKey(key)) {
      throw new Error(`"${key}" is a reserved variable and cannot be set on a context`);
    }
    const existing = await this.getContext(name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }
    const env = { ...(existing.env ?? {}), [key]: value };
    await this.updateContext(name, { env });
  }

  /** Remove one custom env var from a context. No-op if the key is absent. */
  async unsetContextEnv(name: string, key: string): Promise<void> {
    const existing = await this.getContext(name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }
    if (!existing.env || !(key in existing.env)) {
      return;
    }
    const env = { ...existing.env };
    delete env[key];
    await this.updateContext(name, { env });
  }

  /**
   * Switch a context's default namespace. Mirrors xcsh `/context namespace <ns>`:
   * the namespace must be non-empty (use Edit Context to clear it instead).
   */
  async setContextNamespace(name: string, namespace: string): Promise<void> {
    const ns = namespace.trim();
    if (!ns) {
      throw new Error('Namespace must not be empty');
    }
    const existing = await this.getContext(name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }
    await this.updateContext(name, { defaultNamespace: ns });
  }

  async deleteContext(name: string): Promise<void> {
    const filePath = getContextPath(name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Context "${name}" not found`);
    }

    fs.unlinkSync(filePath);

    // Clear active if it was the deleted context
    const activeName = await this.getActiveContextName();
    if (activeName === name) {
      this.clearActiveContext();
    }

    this.clearCacheFor(name);
    this._onDidChangeContext.fire();
  }

  setActiveContext(name: string): Promise<void> {
    const filePath = getContextPath(name);
    if (!fs.existsSync(filePath)) {
      return Promise.reject(new Error(`Context "${name}" not found`));
    }
    this.setActiveContextInternal(name);
    this._onDidChangeContext.fire();
    return Promise.resolve();
  }

  /** Write the active_context pointer without validation. */
  private setActiveContextInternal(name: string): void {
    this.ensureContextsDir(); // ensures parent dir exists
    this.atomicWrite(getActiveContextPath(), `${name}\n`, FILE_MODE);
  }

  /** Remove the active_context file. */
  private clearActiveContext(): void {
    const p = getActiveContextPath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }

  // ───────── local directory helpers ─────────

  /** Ensure the local contexts directory exists with 0o700 permissions. */
  private ensureLocalContextsDir(workspaceFolder: string): void {
    const dir = getLocalContextsDir(workspaceFolder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    }
    this.chmodSafe(dir, DIR_MODE);
  }

  // ───────── local read operations ─────────

  /** List all context JSON files under the workspace's `.xcsh/contexts/`. */
  getLocalContexts(workspaceFolder: string): Promise<XCSHContext[]> {
    const dir = getLocalContextsDir(workspaceFolder);
    if (!fs.existsSync(dir)) {
      return Promise.resolve([]);
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const contexts: XCSHContext[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const ctx = JSON.parse(raw) as XCSHContext;
        contexts.push(this.normalizeContext(ctx));
      } catch (err) {
        this.logger.warn(`Skipping unreadable local context file: ${file}`, err);
      }
    }

    contexts.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(contexts);
  }

  /** Read the active_context pointer from the workspace's local contexts dir. */
  getLocalActiveContextName(workspaceFolder: string): Promise<string | null> {
    const p = getLocalActiveContextPath(workspaceFolder);
    if (!fs.existsSync(p)) {
      return Promise.resolve(null);
    }
    try {
      const name = fs.readFileSync(p, 'utf-8').trim();
      return Promise.resolve(name || null);
    } catch {
      return Promise.resolve(null);
    }
  }

  // ───────── local write operations ─────────

  /** Add an inline context JSON to the workspace's `.xcsh/contexts/`. */
  async addLocalContext(ctx: XCSHContext, workspaceFolder: string): Promise<void> {
    if (!isValidContextName(ctx.name)) {
      throw new Error(`Invalid context name: "${ctx.name}"`);
    }

    this.ensureLocalContextsDir(workspaceFolder);

    const filePath = getLocalContextPath(ctx.name, workspaceFolder);
    if (fs.existsSync(filePath)) {
      throw new Error(`Local context "${ctx.name}" already exists`);
    }

    const toWrite: XCSHContext = {
      ...this.normalizeContext(ctx),
      version: ctx.version ?? CURRENT_SCHEMA_VERSION,
    };

    this.atomicWrite(filePath, `${JSON.stringify(toWrite, null, 2)}\n`, FILE_MODE);

    // Auto-activate if this is the first local context
    const all = await this.getLocalContexts(workspaceFolder);
    if (all.length === 1) {
      this.setLocalActiveContextInternal(ctx.name, workspaceFolder);
    }

    this._onDidChangeContext.fire();
  }

  /** Set the active local context pointer. */
  setLocalActiveContext(name: string, workspaceFolder: string): Promise<void> {
    if (!isValidContextName(name)) {
      return Promise.reject(new Error(`Invalid context name: "${name}"`));
    }
    const filePath = getLocalContextPath(name, workspaceFolder);
    if (!fs.existsSync(filePath)) {
      return Promise.reject(new Error(`Local context "${name}" not found`));
    }
    this.setLocalActiveContextInternal(name, workspaceFolder);
    this._onDidChangeContext.fire();
    return Promise.resolve();
  }

  /** Write the local active_context pointer without validation. */
  private setLocalActiveContextInternal(name: string, workspaceFolder: string): void {
    this.ensureLocalContextsDir(workspaceFolder);
    this.atomicWrite(getLocalActiveContextPath(workspaceFolder), `${name}\n`, FILE_MODE);
  }

  /** Delete a local context file. */
  async deleteLocalContext(name: string, workspaceFolder: string): Promise<void> {
    if (!isValidContextName(name)) {
      throw new Error(`Invalid context name: "${name}"`);
    }
    const filePath = getLocalContextPath(name, workspaceFolder);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local context "${name}" not found`);
    }

    fs.unlinkSync(filePath);

    // Clear active if it was the deleted context
    const activeName = await this.getLocalActiveContextName(workspaceFolder);
    if (activeName === name) {
      const p = getLocalActiveContextPath(workspaceFolder);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }

    this._onDidChangeContext.fire();
  }

  /**
   * Create a pointer context in the workspace that references a global
   * context by name, with optional overrides.
   */
  async linkGlobalContext(globalName: string, workspaceFolder: string, overrides?: ContextOverrides): Promise<void> {
    if (!isValidContextName(globalName)) {
      throw new Error(`Invalid context name: "${globalName}"`);
    }
    // Verify the global context exists
    const globalPath = getContextPath(globalName);
    if (!fs.existsSync(globalPath)) {
      throw new Error(`Global context "${globalName}" not found`);
    }

    this.ensureLocalContextsDir(workspaceFolder);

    const pointer: PointerContext = { context: globalName };
    if (overrides) {
      pointer.overrides = overrides;
    }

    const filePath = getLocalContextPath(globalName, workspaceFolder);
    this.atomicWrite(filePath, `${JSON.stringify(pointer, null, 2)}\n`, FILE_MODE);

    // Auto-activate if this is the first local context
    const all = await this.getLocalContexts(workspaceFolder);
    if (all.length === 1) {
      this.setLocalActiveContextInternal(globalName, workspaceFolder);
    }

    this._onDidChangeContext.fire();
  }

  // ───────── cache management ─────────

  private clearCacheFor(name: string): void {
    const auth = this.authCache.get(name);
    if (auth) {
      auth.dispose();
      this.authCache.delete(name);
    }
    this.clientCache.delete(name);
  }

  private clearAllCaches(): void {
    for (const auth of this.authCache.values()) {
      auth.dispose();
    }
    this.authCache.clear();
    this.clientCache.clear();
  }

  /** Public cache clear for commands (e.g., "Clear Auth Cache"). */
  clearAllCachesPublic(): void {
    this.clearAllCaches();
  }

  // ───────── client factory ─────────

  async getClient(contextName: string): Promise<XCSHClient> {
    const cached = this.clientCache.get(contextName);
    if (cached) {
      return cached;
    }

    const ctx = await this.getContext(contextName);
    if (!ctx) {
      throw new Error(`Context "${contextName}" not found`);
    }

    const authProvider = new TokenAuthProvider({
      apiUrl: ctx.apiUrl,
      apiToken: ctx.apiToken,
    });
    const client = new XCSHClient(ctx.apiUrl, authProvider);

    this.authCache.set(contextName, authProvider);
    this.clientCache.set(contextName, client);

    return client;
  }

  // ───────── validation ─────────

  async validateContext(name: string): Promise<boolean> {
    const ctx = await this.getContext(name);
    if (!ctx) {
      throw new Error(`Context "${name}" not found`);
    }

    const auth = new TokenAuthProvider({
      apiUrl: ctx.apiUrl,
      apiToken: ctx.apiToken,
    });

    try {
      return await auth.validate();
    } finally {
      auth.dispose();
    }
  }

  // ───────── token health ─────────

  getTokenHealth(ctx: XCSHContext): TokenHealth {
    return computeTokenHealth(ctx.metadata?.expiresAt);
  }

  // ───────── file watcher ─────────

  /**
   * Watch the contexts directory and active_context file for external
   * changes.  Fires `onDidChangeContext` so tree views etc. can refresh.
   *
   * When `workspaceFolder` is provided, also watches the local
   * `{workspaceFolder}/.xcsh/contexts/` directory.
   */
  initFileWatcher(workspaceFolder?: string): void {
    if (!this.fileWatcher) {
      const contextsGlob = new vscode.RelativePattern(
        vscode.Uri.file(getConfigDir()),
        '{contexts/*.json,active_context}',
      );

      const watcher = vscode.workspace.createFileSystemWatcher(contextsGlob);

      const onChange = () => {
        this.clearAllCaches();
        this._onDidChangeContext.fire();
      };

      const disposables = [
        watcher,
        watcher.onDidCreate(onChange),
        watcher.onDidChange(onChange),
        watcher.onDidDelete(onChange),
      ];

      this.fileWatcher = vscode.Disposable.from(...disposables);
    }

    // Optionally watch local workspace contexts
    if (workspaceFolder && !this.localFileWatcher) {
      const localDir = getLocalContextsDir(workspaceFolder);
      // Only set up watcher if parent .xcsh dir exists (avoids noise)
      const xcshDir = path.dirname(localDir);
      if (fs.existsSync(xcshDir)) {
        const localGlob = new vscode.RelativePattern(vscode.Uri.file(localDir), '{*.json,active_context}');

        const localWatcher = vscode.workspace.createFileSystemWatcher(localGlob);

        const onLocalChange = () => {
          this.clearAllCaches();
          this._onDidChangeContext.fire();
        };

        const localDisposables = [
          localWatcher,
          localWatcher.onDidCreate(onLocalChange),
          localWatcher.onDidChange(onLocalChange),
          localWatcher.onDidDelete(onLocalChange),
        ];

        this.localFileWatcher = vscode.Disposable.from(...localDisposables);
      }
    }
  }

  // ───────── disposal ─────────

  dispose(): void {
    this.fileWatcher?.dispose();
    this.localFileWatcher?.dispose();
    this.clearAllCaches();
    this._onDidChangeContext.dispose();
  }
}
