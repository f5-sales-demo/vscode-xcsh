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
import {
  type ContextOverrides,
  isPointerContext,
  mergePointerOverrides,
  type PointerContext,
  type ResolvedContext,
  resolveContext as resolveStoredContext,
} from './contextResolver';
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

const SECRET_SENTINEL = '<SECRET_STORAGE>';
const SECRET_KEY_PREFIX = 'xcsh.context.credentials.';
const CREDENTIAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContextSecretStorage = Pick<vscode.SecretStorage, 'delete' | 'get' | 'store'>;

interface ContextSecretPayload {
  apiToken: string;
  env: Record<string, string>;
}

interface LegacyStoredContext extends Omit<XCSHContext, 'apiToken' | 'env'> {
  apiToken: typeof SECRET_SENTINEL;
  credentialId: string;
  env?: Record<string, typeof SECRET_SENTINEL>;
}

export type ContextPersistenceStage = 'duplicate' | 'migration' | 'directory' | 'context-write' | 'active-pointer';

export class ContextPersistenceError extends Error {
  constructor(
    readonly stage: ContextPersistenceStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ContextPersistenceError';
  }
}

const CONTEXT_SCHEMA_URL =
  'https://raw.githubusercontent.com/f5-sales-demo/xcsh/main/packages/coding-agent/src/config/context-schema.json';

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

  /**
   * Session-scoped activation gate. A fresh ContextManager (i.e. a new extension
   * session / window) starts with NO active context even if a persisted
   * `active_context` pointer exists on disk — matching the xcsh TUI, which no longer
   * auto-loads a context. The gate opens only when the user explicitly activates a
   * context (setActiveContext) or creates one (addContext = activate). The persisted
   * pointer file is never cleared, so the TUI (which shares it) is unaffected.
   */
  private sessionActivated = false;

  constructor(private readonly secretStorage: ContextSecretStorage) {}

  /** Whether the user has explicitly activated a context this session. */
  isSessionActivated(): boolean {
    return this.sessionActivated;
  }

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
    try {
      fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode });
      fs.renameSync(tmp, filePath);
      // Ensure final permissions (rename may not preserve them on all OSes)
      this.chmodSafe(filePath, mode);
    } catch (error) {
      try {
        if (fs.existsSync(tmp)) {
          fs.unlinkSync(tmp);
        }
      } catch {
        this.logger.warn('context.temp.cleanup.failed');
      }
      throw error;
    }
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

  private secretKey(credentialId: string): string {
    return `${SECRET_KEY_PREFIX}${credentialId}`;
  }

  private isStringRecord(value: unknown): value is Record<string, string> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).every((entry) => typeof entry === 'string')
    );
  }

  private parseLegacyStoredContext(value: unknown, expectedName?: string): LegacyStoredContext | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.name !== 'string' ||
      !isValidContextName(candidate.name) ||
      (expectedName !== undefined && candidate.name !== expectedName) ||
      typeof candidate.apiUrl !== 'string' ||
      !candidate.apiUrl.startsWith('https://') ||
      candidate.apiToken !== SECRET_SENTINEL ||
      typeof candidate.credentialId !== 'string' ||
      !CREDENTIAL_ID_PATTERN.test(candidate.credentialId) ||
      typeof candidate.defaultNamespace !== 'string'
    ) {
      return null;
    }
    if (candidate.env !== undefined) {
      if (!this.isStringRecord(candidate.env)) {
        return null;
      }
      for (const [key, entry] of Object.entries(candidate.env)) {
        if (!isValidEnvKey(key) || isReservedEnvKey(key) || entry !== SECRET_SENTINEL) {
          return null;
        }
      }
    }
    return this.normalizeContext(candidate as unknown as LegacyStoredContext) as LegacyStoredContext;
  }

  private parseCanonicalContext(value: unknown, expectedName?: string): XCSHContext | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.name !== 'string' ||
      !isValidContextName(candidate.name) ||
      (expectedName !== undefined && candidate.name !== expectedName) ||
      typeof candidate.apiUrl !== 'string' ||
      !candidate.apiUrl.startsWith('https://') ||
      typeof candidate.apiToken !== 'string' ||
      candidate.apiToken === SECRET_SENTINEL ||
      candidate.apiToken.trim().length === 0 ||
      typeof candidate.defaultNamespace !== 'string' ||
      (candidate.version !== undefined &&
        (typeof candidate.version !== 'number' || candidate.version > CURRENT_SCHEMA_VERSION))
    ) {
      return null;
    }
    if (candidate.env !== undefined) {
      if (!this.isStringRecord(candidate.env)) {
        return null;
      }
      if (Object.keys(candidate.env).some((key) => !isValidEnvKey(key) || isReservedEnvKey(key))) {
        return null;
      }
    }
    if (
      candidate.sensitiveKeys !== undefined &&
      (!Array.isArray(candidate.sensitiveKeys) || candidate.sensitiveKeys.some((key) => typeof key !== 'string'))
    ) {
      return null;
    }
    const { $schema: _schema, credentialId: _credentialId, ...context } = candidate;
    void _schema;
    void _credentialId;
    return this.normalizeContext(context as unknown as XCSHContext);
  }

  private parseSecretPayload(raw: string, expectedEnvKeys: readonly string[]): ContextSecretPayload | null {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
      }
      const candidate = value as Record<string, unknown>;
      if (
        typeof candidate.apiToken !== 'string' ||
        candidate.apiToken.trim().length === 0 ||
        !this.isStringRecord(candidate.env)
      ) {
        return null;
      }
      const actualKeys = Object.keys(candidate.env).sort();
      const expectedKeys = [...expectedEnvKeys].sort();
      if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        return null;
      }
      return { apiToken: candidate.apiToken, env: candidate.env };
    } catch {
      return null;
    }
  }

  private async hydrateContext(stored: LegacyStoredContext): Promise<XCSHContext | null> {
    const raw = await this.secretStorage.get(this.secretKey(stored.credentialId));
    if (!raw) {
      return null;
    }
    const payload = this.parseSecretPayload(raw, Object.keys(stored.env ?? {}));
    if (!payload) {
      return null;
    }
    const { env: _storedEnv, credentialId: _credentialId, ...nonSecret } = stored;
    void _storedEnv;
    void _credentialId;
    return {
      ...nonSecret,
      apiToken: payload.apiToken,
      ...(Object.keys(payload.env).length > 0 ? { env: payload.env } : {}),
    };
  }

  private canonicalPayload(ctx: XCSHContext): string {
    return `${JSON.stringify({ $schema: CONTEXT_SCHEMA_URL, ...this.normalizeContext(ctx) }, null, 2)}\n`;
  }

  private async readContext(filePath: string, expectedName?: string): Promise<XCSHContext | null> {
    let value: unknown;
    try {
      value = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      this.logger.warn('context.read.failed');
      return null;
    }
    const canonical = this.parseCanonicalContext(value, expectedName);
    if (canonical) {
      return canonical;
    }

    const legacy = this.parseLegacyStoredContext(value, expectedName);
    if (!legacy) {
      this.logger.warn('context.read.failed');
      return null;
    }
    const hydrated = await this.hydrateContext(legacy);
    if (!hydrated) {
      this.logger.warn('context.secret.missing');
      return null;
    }
    try {
      this.atomicWrite(filePath, this.canonicalPayload(hydrated), FILE_MODE);
      const verified = this.parseCanonicalContext(JSON.parse(fs.readFileSync(filePath, 'utf-8')), expectedName);
      if (!verified) {
        throw new Error('Canonical context verification failed');
      }
      await this.secretStorage.delete(this.secretKey(legacy.credentialId));
      return verified;
    } catch (error) {
      this.logger.warn('context.read.failed');
      throw new ContextPersistenceError('migration', 'Could not migrate legacy context credentials', { cause: error });
    }
  }

  // ───────── read operations ─────────

  async getContexts(): Promise<XCSHContext[]> {
    const dir = getContextsDir();
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const contexts: XCSHContext[] = [];

    for (const file of files) {
      try {
        const name = path.basename(file, '.json');
        const ctx = await this.readContext(path.join(dir, file), name);
        if (ctx) {
          contexts.push(ctx);
        }
      } catch {
        this.logger.warn('context.read.failed');
      }
    }

    contexts.sort((a, b) => a.name.localeCompare(b.name));
    return contexts;
  }

  async getContext(name: string): Promise<XCSHContext | null> {
    const filePath = getContextPath(name);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return this.readContext(filePath, name);
  }

  /** Check the canonical filename directly, including unreadable or not-yet-migrated legacy records. */
  contextExists(name: string): boolean {
    return isValidContextName(name) && fs.existsSync(getContextPath(name));
  }

  getActiveContextName(): Promise<string | null> {
    // Session gate: do not honor a persisted active context until the user has
    // explicitly activated one this session (no auto-load, matching the TUI).
    if (!this.sessionActivated) {
      return Promise.resolve(null);
    }
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

    try {
      this.ensureContextsDir();
    } catch (error) {
      throw new ContextPersistenceError('directory', 'Could not create the xcsh context directory', { cause: error });
    }

    const filePath = getContextPath(ctx.name);
    if (fs.existsSync(filePath)) {
      throw new ContextPersistenceError('duplicate', `Context "${ctx.name}" already exists`);
    }

    const normalized: XCSHContext = {
      ...this.normalizeContext(ctx),
      version: ctx.version ?? CURRENT_SCHEMA_VERSION,
      metadata: ctx.metadata ?? { createdAt: new Date().toISOString() },
    };
    try {
      this.atomicWrite(filePath, this.canonicalPayload(normalized), FILE_MODE);
    } catch (error) {
      throw new ContextPersistenceError('context-write', `Could not write context "${ctx.name}"`, { cause: error });
    }
    try {
      await this.setActiveContext(ctx.name);
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw new ContextPersistenceError('active-pointer', `Context "${ctx.name}" was not activated`, { cause: error });
    }
  }

  async updateContext(name: string, updates: Partial<XCSHContext>): Promise<void> {
    const filePath = getContextPath(name);
    const existing = await this.getContext(name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }

    const merged: XCSHContext = this.normalizeContext({
      ...existing,
      ...updates,
      name,
    });

    this.ensureContextsDir();
    try {
      this.atomicWrite(filePath, this.canonicalPayload(merged), FILE_MODE);
    } catch (error) {
      throw new ContextPersistenceError('context-write', `Could not update context "${name}"`, { cause: error });
    }

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

  /**
   * Rename a context, preserving all its fields and its active status. Mirrors
   * xcsh `/context rename <old> <new>`. Reuses add/setActive/delete so name
   * validation, duplicate checks, and the active pointer stay consistent.
   */
  async renameContext(oldName: string, newName: string): Promise<void> {
    const oldPath = getContextPath(oldName);
    const existing = await this.getContext(oldName);
    if (!existing) {
      throw new Error(`Context "${oldName}" not found`);
    }
    if (oldName === newName) {
      return;
    }
    if (!isValidContextName(newName)) {
      throw new Error(`Invalid context name: "${newName}"`);
    }
    const newPath = getContextPath(newName);
    if (fs.existsSync(newPath)) {
      throw new Error(`Context "${newName}" already exists`);
    }
    const activePath = getActiveContextPath();
    const rawBefore = fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf-8').trim() || null : null;
    const renamed: XCSHContext = { ...existing, name: newName };
    this.atomicWrite(newPath, this.canonicalPayload(renamed), FILE_MODE);
    try {
      fs.unlinkSync(oldPath);
    } catch (error) {
      fs.unlinkSync(newPath);
      throw error;
    }
    if (rawBefore === oldName) {
      this.setActiveContextInternal(newName);
    }
    this.clearCacheFor(oldName);
    this.clearCacheFor(newName);
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
    this.sessionActivated = true;
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
  async getLocalContexts(workspaceFolder: string): Promise<XCSHContext[]> {
    const dir = getLocalContextsDir(workspaceFolder);
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const contexts: XCSHContext[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (isPointerContext(value)) {
          const globalContext = await this.getContext(value.context);
          if (globalContext) {
            contexts.push(value.overrides ? mergePointerOverrides(globalContext, value.overrides) : globalContext);
          }
          continue;
        }
        const name = path.basename(file, '.json');
        const canonical = this.parseCanonicalContext(value, name);
        if (canonical) {
          contexts.push(canonical);
          continue;
        }
        const stored = this.parseLegacyStoredContext(value, name);
        const ctx = stored ? await this.migrateLocalLegacy(stored, filePath, workspaceFolder) : null;
        if (ctx) {
          contexts.push(ctx);
        } else {
          this.logger.warn('context.read.failed');
        }
      } catch {
        this.logger.warn('context.read.failed');
      }
    }

    contexts.sort((a, b) => a.name.localeCompare(b.name));
    return contexts;
  }

  /** Read the active_context pointer from the workspace's local contexts dir. */
  getLocalActiveContextName(workspaceFolder: string): Promise<string | null> {
    // Session gate: see getActiveContextName — no auto-load until explicit activation.
    if (!this.sessionActivated) {
      return Promise.resolve(null);
    }
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

  /** Compatibility entry point: create globally and write only a project pointer locally. */
  async addLocalContext(ctx: XCSHContext, workspaceFolder: string): Promise<void> {
    await this.addGlobalContextAndLink(ctx, workspaceFolder);
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
    this.sessionActivated = true;
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

    // Linking a global context into the workspace activates it (explicit user action).
    await this.setLocalActiveContext(globalName, workspaceFolder);
  }

  /** Transactionally create a canonical global context and link it into a workspace. */
  async addGlobalContextAndLink(ctx: XCSHContext, workspaceFolder: string): Promise<void> {
    const priorGlobalPointer = fs.existsSync(getActiveContextPath())
      ? fs.readFileSync(getActiveContextPath(), 'utf-8')
      : undefined;
    const priorLocalPointer = fs.existsSync(getLocalActiveContextPath(workspaceFolder))
      ? fs.readFileSync(getLocalActiveContextPath(workspaceFolder), 'utf-8')
      : undefined;
    const globalPath = getContextPath(ctx.name);
    const localPath = getLocalContextPath(ctx.name, workspaceFolder);
    const globalExisted = fs.existsSync(globalPath);
    const priorLocalContext = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf-8') : undefined;
    try {
      await this.addContext(ctx);
      await this.linkGlobalContext(ctx.name, workspaceFolder);
    } catch (error) {
      if (!globalExisted && fs.existsSync(globalPath)) {
        fs.unlinkSync(globalPath);
      }
      this.restorePointer(localPath, priorLocalContext);
      this.restorePointer(getActiveContextPath(), priorGlobalPointer);
      this.restorePointer(getLocalActiveContextPath(workspaceFolder), priorLocalPointer);
      throw error;
    }
  }

  private restorePointer(filePath: string, prior: string | undefined): void {
    if (prior === undefined) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }
    this.atomicWrite(filePath, prior, FILE_MODE);
  }

  private sameContext(left: XCSHContext, right: XCSHContext): boolean {
    const sortedRecord = (record: Record<string, string> | undefined): Record<string, string> =>
      Object.fromEntries(Object.entries(record ?? {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)));
    const comparable = (ctx: XCSHContext): unknown => ({
      apiUrl: this.normalizeContext(ctx).apiUrl,
      apiToken: ctx.apiToken,
      defaultNamespace: ctx.defaultNamespace,
      env: sortedRecord(ctx.env),
      sensitiveKeys: [...(ctx.sensitiveKeys ?? [])].sort(),
    });
    return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
  }

  private async migrateLocalLegacy(
    stored: LegacyStoredContext,
    legacyPath: string,
    workspaceFolder: string,
  ): Promise<XCSHContext | null> {
    const hydrated = await this.hydrateContext(stored);
    if (!hydrated) {
      return null;
    }
    let globalName = stored.name;
    const existing = await this.getContext(globalName);
    if (existing && !this.sameContext(existing, hydrated)) {
      const replacement = await vscode.window.showInputBox({
        prompt: vscode.l10n.t(
          'A different global context named "{0}" already exists. Enter a new global name.',
          globalName,
        ),
        validateInput: (value) =>
          !isValidContextName(value) ||
          fs.existsSync(getContextPath(value)) ||
          fs.existsSync(getLocalContextPath(value, workspaceFolder))
            ? vscode.l10n.t('Choose a valid, unused global context name')
            : null,
        ignoreFocusOut: true,
      });
      if (!replacement) {
        return null;
      }
      globalName = replacement;
    }

    const globalPath = getContextPath(globalName);
    const pointerPath = getLocalContextPath(globalName, workspaceFolder);
    const createdGlobal = !fs.existsSync(globalPath);
    const legacyRaw = fs.readFileSync(legacyPath, 'utf-8');
    const activePath = getLocalActiveContextPath(workspaceFolder);
    const priorActive = fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf-8') : undefined;
    try {
      if (createdGlobal) {
        this.ensureContextsDir();
        this.atomicWrite(globalPath, this.canonicalPayload({ ...hydrated, name: globalName }), FILE_MODE);
        if (!(await this.getContext(globalName))) {
          throw new Error('Global migration verification failed');
        }
      }
      const pointer: PointerContext = { context: globalName };
      this.ensureLocalContextsDir(workspaceFolder);
      this.atomicWrite(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`, FILE_MODE);
      const verified = JSON.parse(fs.readFileSync(pointerPath, 'utf-8')) as unknown;
      if (!isPointerContext(verified) || verified.context !== globalName) {
        throw new Error('Pointer verification failed');
      }
      if (priorActive?.trim() === stored.name && globalName !== stored.name) {
        this.setLocalActiveContextInternal(globalName, workspaceFolder);
      }
      if (pointerPath !== legacyPath) {
        fs.unlinkSync(legacyPath);
      }
      await this.secretStorage.delete(this.secretKey(stored.credentialId));
      return { ...hydrated, name: globalName };
    } catch (error) {
      if (createdGlobal && fs.existsSync(globalPath)) {
        fs.unlinkSync(globalPath);
      }
      if (pointerPath !== legacyPath && fs.existsSync(pointerPath)) {
        fs.unlinkSync(pointerPath);
      }
      this.atomicWrite(legacyPath, legacyRaw, FILE_MODE);
      this.restorePointer(activePath, priorActive);
      throw new ContextPersistenceError('migration', 'Could not migrate the project context', { cause: error });
    }
  }

  async resolveContext(workspaceFolder: string | undefined): Promise<ResolvedContext | null> {
    const resolved = await resolveStoredContext(workspaceFolder);
    if (!resolved) {
      return null;
    }
    if (resolved.source === 'env') {
      const ctx = resolved.context;
      if (
        typeof ctx.apiUrl !== 'string' ||
        !ctx.apiUrl.startsWith('https://') ||
        typeof ctx.apiToken !== 'string' ||
        ctx.apiToken.trim().length === 0 ||
        typeof ctx.defaultNamespace !== 'string'
      ) {
        return null;
      }
      return { ...resolved, context: this.normalizeContext(ctx) };
    }
    const context = this.parseCanonicalContext(resolved.context);
    if (context) {
      return { ...resolved, context };
    }

    const legacy = this.parseLegacyStoredContext(resolved.context);
    if (!legacy) {
      this.logger.warn('context.read.failed');
      return null;
    }

    if (resolved.source === 'global') {
      const migrated = await this.readContext(resolved.sourcePath, legacy.name);
      return migrated ? { ...resolved, context: migrated } : null;
    }

    if (!workspaceFolder) {
      this.logger.warn('context.read.failed');
      return null;
    }
    try {
      const localValue: unknown = JSON.parse(fs.readFileSync(resolved.sourcePath, 'utf-8'));
      if (isPointerContext(localValue)) {
        const migrated = await this.getContext(localValue.context);
        if (!migrated) {
          return null;
        }
        const merged = localValue.overrides ? mergePointerOverrides(migrated, localValue.overrides) : migrated;
        return { ...resolved, context: this.normalizeContext(merged) };
      }
      const migrated = await this.migrateLocalLegacy(legacy, resolved.sourcePath, workspaceFolder);
      return migrated ? { ...resolved, context: migrated } : null;
    } catch (error) {
      if (error instanceof ContextPersistenceError) {
        throw error;
      }
      this.logger.warn('context.read.failed');
      return null;
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
