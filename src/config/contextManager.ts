// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TokenAuthProvider } from '../api/auth/tokenAuth';
import { F5XCClient } from '../api/client';
import { getLogger } from '../utils/logger';
import {
  DIR_MODE,
  FILE_MODE,
  getActiveContextPath,
  getConfigDir,
  getContextPath,
  getContextsDir,
} from './contextPaths';
import {
  type ContextManagerInterface,
  CURRENT_SCHEMA_VERSION,
  computeTokenHealth,
  type F5XCContext,
  isValidContextName,
  type TokenHealth,
} from './contextTypes';

/**
 * Manages F5 XC context files stored in ~/.config/f5xc/contexts/.
 *
 * Implements atomic writes (write-to-tmp then rename), 0o600 file
 * permissions, and caches F5XCClient / TokenAuthProvider instances
 * per context.  A file-system watcher fires `onDidChangeContext`
 * when contexts are modified externally (e.g., by xcsh).
 */
export class ContextManager implements ContextManagerInterface, vscode.Disposable {
  private readonly logger = getLogger();
  private readonly clientCache = new Map<string, F5XCClient>();
  private readonly authCache = new Map<string, TokenAuthProvider>();

  private readonly _onDidChangeContext = new vscode.EventEmitter<void>();
  readonly onDidChangeContext: vscode.Event<void> = this._onDidChangeContext.event;

  private fileWatcher: vscode.Disposable | undefined;

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

  // ───────── read operations ─────────

  getContexts(): Promise<F5XCContext[]> {
    const dir = getContextsDir();
    if (!fs.existsSync(dir)) {
      return Promise.resolve([]);
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const contexts: F5XCContext[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const ctx = JSON.parse(raw) as F5XCContext;
        contexts.push(ctx);
      } catch (err) {
        this.logger.warn(`Skipping unreadable context file: ${file}`, err);
      }
    }

    contexts.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(contexts);
  }

  getContext(name: string): Promise<F5XCContext | null> {
    const filePath = getContextPath(name);
    if (!fs.existsSync(filePath)) {
      return Promise.resolve(null);
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return Promise.resolve(JSON.parse(raw) as F5XCContext);
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

  async getActiveContext(): Promise<F5XCContext | null> {
    const name = await this.getActiveContextName();
    if (!name) {
      return null;
    }
    return this.getContext(name);
  }

  // ───────── write operations ─────────

  async addContext(ctx: F5XCContext): Promise<void> {
    if (!isValidContextName(ctx.name)) {
      throw new Error(`Invalid context name: "${ctx.name}"`);
    }

    this.ensureContextsDir();

    const filePath = getContextPath(ctx.name);
    if (fs.existsSync(filePath)) {
      throw new Error(`Context "${ctx.name}" already exists`);
    }

    const toWrite: F5XCContext = {
      ...ctx,
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

  async updateContext(name: string, updates: Partial<F5XCContext>): Promise<void> {
    const existing = await this.getContext(name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }

    const merged: F5XCContext = { ...existing, ...updates, name };

    this.ensureContextsDir();
    this.atomicWrite(getContextPath(name), `${JSON.stringify(merged, null, 2)}\n`, FILE_MODE);

    // Clear caches for this context
    this.clearCacheFor(name);
    this._onDidChangeContext.fire();
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

  async getClient(contextName: string): Promise<F5XCClient> {
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
    const client = new F5XCClient(ctx.apiUrl, authProvider);

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

  getTokenHealth(ctx: F5XCContext): TokenHealth {
    return computeTokenHealth(ctx.metadata?.expiresAt);
  }

  // ───────── file watcher ─────────

  /**
   * Watch the contexts directory and active_context file for external
   * changes.  Fires `onDidChangeContext` so tree views etc. can refresh.
   */
  initFileWatcher(): void {
    if (this.fileWatcher) {
      return; // already watching
    }

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

  // ───────── disposal ─────────

  dispose(): void {
    this.fileWatcher?.dispose();
    this.clearAllCaches();
    this._onDidChangeContext.dispose();
  }
}
