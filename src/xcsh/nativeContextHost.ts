// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getActiveContextPath, getContextsDir, getLocalContextsDir } from '../config/contextPaths';
import type { ResolvedContext } from '../config/contextResolver';
import type { ContextManagerInterface } from '../config/contextTypes';
import { CURRENT_SCHEMA_VERSION, computeTokenHealth } from '../config/contextTypes';

/** Structural host contract; replace with package type imports when its release is pinned. */
export interface NativeContextSnapshot {
  readonly active: boolean;
  readonly workspaceId: string;
  readonly contextId: string;
  readonly revision: string;
  readonly apiUrl: string;
  readonly namespace: string;
}

export interface NativeApprovalPlan {
  readonly id: string;
  readonly hash: string;
  readonly entries: readonly unknown[];
}

export interface NativeReceipt {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly planHash: string;
  readonly binding: string;
  readonly stage: string;
  readonly completed: number;
  readonly code?: string;
}

/**
 * Owns context identity and approvals for a single editor window. Resolution stays
 * in ContextManager; this adapter never activates a context or changes its files.
 * Synchronous fingerprints prevent writes during the filesystem watcher's delay.
 */
export class NativeContextHost implements vscode.Disposable {
  private readonly workspaceId = randomUUID();
  private contextId = randomUUID();
  private revision = randomUUID();
  private epoch = 0;
  private prepared: { resolved: ResolvedContext; fingerprint: string; snapshot: NativeContextSnapshot } | undefined;
  private readonly listener: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly manager: ContextManagerInterface,
    private readonly workspaceRoot: () => string | undefined,
    private readonly storagePath: string,
  ) {
    this.listener = manager.onDidChangeContext(() => {
      this.epoch++;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.prepared = undefined;
    this.listener.dispose();
  }

  private fingerprint(): string {
    if (this.disposed) {
      throw new Error('CONTEXT_UNAVAILABLE');
    }
    const hash = createHash('sha256');
    const include = (value: unknown): void => {
      hash.update(JSON.stringify(value));
      hash.update('\n');
    };
    include([this.epoch, this.manager.isSessionActivated(), this.workspaceRoot()]);
    include(
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('XCSH_') || key === 'XDG_CONFIG_HOME')
        .sort(),
    );
    const directories = new Set([getContextsDir()]);
    let parent = this.workspaceRoot();
    while (parent) {
      directories.add(getLocalContextsDir(parent));
      const next = path.dirname(parent);
      if (next === parent) {
        break;
      }
      parent = next;
    }
    const files = new Set([getActiveContextPath()]);
    for (const directory of directories) {
      include(directory);
      try {
        for (const name of fs.readdirSync(directory).sort()) {
          if (name.endsWith('.json') || name === 'active_context') {
            files.add(path.join(directory, name));
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error('CONTEXT_UNAVAILABLE', { cause: error });
        }
        include('absent');
      }
    }
    for (const file of [...files].sort()) {
      include(file);
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size > 4 * 1024 * 1024) {
          throw new Error('CONTEXT_UNAVAILABLE');
        }
        include([stat.dev, stat.ino, stat.mtimeMs, stat.ctimeMs, stat.size]);
        hash.update(fs.readFileSync(file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new Error('CONTEXT_UNAVAILABLE', { cause: error });
        }
        include('absent');
      }
    }
    return hash.digest('hex');
  }

  /** Call before binding a request. Existing bindings are never silently refreshed. */
  async prepareContext(signal?: AbortSignal): Promise<NativeContextSnapshot> {
    if (signal?.aborted) {
      throw new Error('CANCELED');
    }
    const previous = this.prepared;
    this.prepared = undefined;
    const fingerprint = this.fingerprint();
    const resolved = await this.manager.resolveContext(this.workspaceRoot());
    if (signal?.aborted) {
      throw new Error('CANCELED');
    }
    if (fingerprint !== this.fingerprint()) {
      throw new Error('STALE_BINDING');
    }
    if (!resolved || (resolved.source !== 'env' && !this.manager.isSessionActivated())) {
      this.prepared = undefined;
      throw new Error('NO_ACTIVE_CONTEXT');
    }
    if ((resolved.context.version ?? 0) > CURRENT_SCHEMA_VERSION) {
      throw new Error('CONTEXT_VERSION_UNSUPPORTED');
    }
    if (computeTokenHealth(resolved.context.metadata?.expiresAt) === 'expired') {
      throw new Error('CREDENTIALS_EXPIRED');
    }
    // Credential rotation changes the opaque revision even if private SecretStorage
    // updates have not yet produced a ContextManager event.
    const identity = createHash('sha256').update(JSON.stringify(resolved)).digest('hex');
    const priorIdentity = previous && createHash('sha256').update(JSON.stringify(previous.resolved)).digest('hex');
    if (previous?.fingerprint !== fingerprint || priorIdentity !== identity) {
      this.revision = randomUUID();
    }
    if (
      !previous ||
      previous.resolved.source !== resolved.source ||
      previous.resolved.sourcePath !== resolved.sourcePath ||
      previous.resolved.context.name !== resolved.context.name
    ) {
      this.contextId = randomUUID();
    }
    const snapshot = Object.freeze({
      active: true,
      workspaceId: this.workspaceId,
      contextId: this.contextId,
      revision: this.revision,
      apiUrl: resolved.context.apiUrl,
      namespace: resolved.context.defaultNamespace,
    });
    // Hold a private copy, independent of cached objects owned by the manager.
    this.prepared = { resolved: structuredClone(resolved), fingerprint, snapshot };
    return snapshot;
  }

  getContext(signal?: AbortSignal): NativeContextSnapshot {
    if (signal?.aborted) {
      throw new Error('CANCELED');
    }
    if (!this.prepared) {
      throw new Error('NO_ACTIVE_CONTEXT');
    }
    if (computeTokenHealth(this.prepared.resolved.context.metadata?.expiresAt) === 'expired') {
      throw new Error('CREDENTIALS_EXPIRED');
    }
    if (this.prepared.fingerprint !== this.fingerprint()) {
      throw new Error('STALE_BINDING');
    }
    return this.prepared.snapshot;
  }

  async getCredentials(snapshot: NativeContextSnapshot, signal?: AbortSignal): Promise<{ apiToken: string }> {
    if (snapshot !== this.getContext(signal) && JSON.stringify(snapshot) !== JSON.stringify(this.getContext(signal))) {
      throw new Error('STALE_BINDING');
    }
    const expected = this.prepared;
    if (!expected) {
      throw new Error('NO_ACTIVE_CONTEXT');
    }
    const resolved = await this.manager.resolveContext(this.workspaceRoot());
    this.getContext(signal);
    if (!resolved || JSON.stringify(resolved) !== JSON.stringify(expected.resolved)) {
      throw new Error('STALE_BINDING');
    }
    if (!resolved.context.apiToken) {
      throw new Error('CREDENTIALS_UNAVAILABLE');
    }
    if (computeTokenHealth(resolved.context.metadata?.expiresAt) === 'expired') {
      throw new Error('CREDENTIALS_EXPIRED');
    }
    return { apiToken: resolved.context.apiToken };
  }

  async approve(plan: NativeApprovalPlan, signal?: AbortSignal): Promise<{ approved: boolean; planHash: string }> {
    this.getContext(signal);
    const result = await vscode.window.showWarningMessage(
      vscode.l10n.t('Apply this xcsh plan?'),
      {
        modal: true,
        detail: JSON.stringify({ planHash: plan.hash, entries: plan.entries }, null, 2),
      },
      vscode.l10n.t('Apply plan'),
    );
    this.getContext(signal);
    return { approved: result === vscode.l10n.t('Apply plan'), planHash: plan.hash };
  }

  async persist(receipt: NativeReceipt): Promise<void> {
    if (this.disposed) {
      throw new Error('CONTEXT_UNAVAILABLE');
    }
    if (!/^[0-9a-f-]{36}$/i.test(receipt.planId)) {
      throw new Error('INVALID_RECEIPT');
    }
    const directory = path.join(this.storagePath, 'native-f5-receipts');
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await fs.promises.lstat(directory)).isSymbolicLink()) {
      throw new Error('INVALID_RECEIPT_STORAGE');
    }
    if (process.platform !== 'win32') {
      await fs.promises.chmod(directory, 0o700);
    }
    const destination = path.join(directory, `${receipt.planId}.json`);
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(receipt), { mode: 0o600, flag: 'wx' });
      await fs.promises.rename(temporary, destination);
    } finally {
      await fs.promises.rm(temporary, { force: true });
    }
  }
}
