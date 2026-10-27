// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import * as vscode from 'vscode';

export interface ManagedWorkspaceAgentOptions {
  /** Packaged, version-neutral instructions, with no model override. */
  readonly document: string;
  /** True only while the packaged core and native tool are registered. */
  readonly isAvailable: () => boolean;
}

const ownership = '\n<!-- Managed by xcsh native workspace-agent registration. Preserve user edits. -->\n';
const code = (error: unknown): string | undefined => (error as NodeJS.ErrnoException)?.code;

/** Stable native workspace URI. Existing files are never overwritten or deleted. */
export class ManagedWorkspaceAgent implements vscode.Disposable {
  readonly agentUri: vscode.Uri | undefined;
  private readonly workspaceUri: vscode.Uri | undefined;
  private readonly document: string;
  private canonicalRoot: string | undefined;
  private disposed = false;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: ManagedWorkspaceAgentOptions) {
    const folders = vscode.workspace.workspaceFolders;
    this.workspaceUri = folders?.length === 1 ? folders[0]?.uri : undefined;
    this.agentUri =
      this.workspaceUri?.scheme === 'file'
        ? vscode.Uri.file(join(this.workspaceUri.fsPath, '.github', 'agents', 'xcsh.agent.md'))
        : undefined;
    this.document = options.document + ownership;
  }

  dispose(): void {
    this.disposed = true;
    // Other windows and native conversation history use the same URI. Removing
    // it here would revoke their agent during reload or window closure. Native
    // tool readiness must be revoked separately by its registration lifecycle.
  }

  private check(token?: vscode.CancellationToken): { workspaceUri: vscode.Uri; agentUri: vscode.Uri } {
    if (token?.isCancellationRequested) {
      throw new Error('CANCELED');
    }
    if (
      this.disposed ||
      vscode.env.appName === 'Kiro' ||
      !vscode.workspace.isTrusted ||
      !this.options.isAvailable() ||
      !this.agentUri ||
      !this.workspaceUri
    ) {
      throw new Error('NATIVE_AGENT_UNAVAILABLE');
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length !== 1 || folders[0]?.uri.toString() !== this.workspaceUri.toString()) {
      throw new Error('STALE_WORKSPACE');
    }
    if (
      !this.options.document.startsWith('---\n') ||
      /^model\s*:/m.test(this.options.document) ||
      Buffer.byteLength(this.document) > 64 * 1024
    ) {
      throw new Error('NATIVE_AGENT_INVALID_DOCUMENT');
    }
    return { workspaceUri: this.workspaceUri, agentUri: this.agentUri };
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run);
    this.pending = result.catch(() => {});
    return result;
  }

  private async directories(create: boolean, token?: vscode.CancellationToken): Promise<void> {
    const { workspaceUri } = this.check(token);
    const root = workspaceUri.fsPath;
    const resolved = await realpath(root);
    this.check(token);
    if (this.canonicalRoot !== undefined && resolved !== this.canonicalRoot) {
      throw new Error('NATIVE_AGENT_UNSAFE_PATH');
    }
    this.canonicalRoot = resolved;
    for (const path of [root, join(root, '.github'), join(root, '.github', 'agents')]) {
      this.check(token);
      let stat: Stats;
      try {
        stat = await lstat(path);
      } catch (error) {
        if (code(error) !== 'ENOENT') {
          throw error;
        }
        if (!create || path === root) {
          throw new Error('NATIVE_AGENT_NOT_READY', { cause: error });
        }
        this.check(token);
        try {
          await mkdir(path, { mode: 0o700 });
        } catch (mkdirError) {
          if (code(mkdirError) !== 'EEXIST') {
            throw mkdirError;
          }
        }
        this.check(token);
        stat = await lstat(path);
      }
      this.check(token);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('NATIVE_AGENT_UNSAFE_PATH');
      }
      const actual = await realpath(path);
      this.check(token);
      const expected = join(resolved, relative(root, path));
      if (actual !== expected) {
        throw new Error('NATIVE_AGENT_UNSAFE_PATH');
      }
    }
  }

  private async readOwned(token?: vscode.CancellationToken): Promise<void> {
    await this.directories(false, token);
    const path = this.check(token).agentUri.fsPath;
    try {
      const stat = await lstat(path);
      this.check(token);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error('NATIVE_AGENT_UNSAFE_PATH');
      }
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        this.check(token);
        const opened = await file.stat();
        this.check(token);
        if (opened.dev !== stat.dev || opened.ino !== stat.ino) {
          throw new Error('NATIVE_AGENT_CONFLICT');
        }
        if (!opened.isFile() || opened.size !== Buffer.byteLength(this.document)) {
          throw new Error('NATIVE_AGENT_CONFLICT');
        }
        const contents = await file.readFile('utf8');
        this.check(token);
        if (contents !== this.document) {
          throw new Error('NATIVE_AGENT_CONFLICT');
        }
        const latest = await lstat(path);
        this.check(token);
        if (latest.isSymbolicLink()) {
          throw new Error('NATIVE_AGENT_UNSAFE_PATH');
        }
        if (
          latest.dev !== opened.dev ||
          latest.ino !== opened.ino ||
          latest.mtimeMs !== opened.mtimeMs ||
          latest.size !== opened.size
        ) {
          throw new Error('NATIVE_AGENT_CONFLICT');
        }
      } finally {
        await file.close();
      }
      await this.directories(false, token);
    } catch (error) {
      if (code(error) === 'ENOENT') {
        throw new Error('NATIVE_AGENT_NOT_READY', { cause: error });
      }
      if (code(error) === 'ELOOP') {
        throw new Error('NATIVE_AGENT_UNSAFE_PATH', { cause: error });
      }
      throw error;
    }
  }

  /** Publish complete initial contents through the editor, with overwrite disabled. */
  ensure(token?: vscode.CancellationToken): Promise<vscode.Uri> {
    return this.enqueue(async () => {
      const { agentUri } = this.check(token);
      await this.directories(true, token);
      try {
        await this.readOwned(token);
        return agentUri;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'NATIVE_AGENT_NOT_READY') {
          throw error;
        }
      }
      this.check(token);
      await this.directories(false, token);
      this.check(token);
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(agentUri, {
        overwrite: false,
        ignoreIfExists: false,
        contents: Buffer.from(this.document, 'utf8'),
      });
      // The public file API notifies native customization discovery. A Node
      // filesystem write alone can remain invisible until the editor reloads.
      // A rejected edit may be a simultaneous owned creation; inspect exact
      // bytes once rather than retrying or replacing any file.
      await vscode.workspace.applyEdit(edit);
      this.check(token);
      await this.readOwned(token);
      return agentUri;
    });
  }

  /** Revalidate before routing; removal and edits do not trigger automatic repair. */
  verify(token?: vscode.CancellationToken): Promise<void> {
    return this.enqueue(() => this.readOwned(token));
  }
}
