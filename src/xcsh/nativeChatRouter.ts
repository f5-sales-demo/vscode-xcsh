// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

export interface NativeChatRouterOptions {
  readonly agentUri: vscode.Uri;
  readonly storagePath: string;
  readonly isAvailable: () => boolean;
  readonly workspace: () => string | undefined;
  readonly prepareModels?: () => Promise<void>;
  readonly agentRegistrationTimeoutMs?: number;
}

/** Native commands only: no model override, automatic submission or editor internals. */
export class NativeChatRouter implements vscode.Disposable {
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: NativeChatRouterOptions) {}

  dispose(): void {
    this.disposed = true;
    // Native history and unsubmitted drafts can still reference attachment files.
    // Do not remove those files when the extension host reloads.
  }

  private check(workspace: string | undefined, token?: vscode.CancellationToken): asserts workspace is string {
    if (token?.isCancellationRequested) {
      throw new Error('CANCELED');
    }
    if (this.disposed || !this.options.isAvailable() || workspace === undefined) {
      throw new Error('NATIVE_CHAT_UNAVAILABLE');
    }
    if (!vscode.window.state.focused) {
      throw new Error('NATIVE_CHAT_WINDOW_NOT_FOCUSED');
    }
    if (this.options.workspace() !== workspace) {
      throw new Error('STALE_WORKSPACE');
    }
  }

  private enqueue(run: (workspace: string) => Promise<void>, token?: vscode.CancellationToken): Promise<void> {
    const workspace = this.options.workspace();
    const result = this.pending.then(async () => {
      this.check(workspace, token);
      if (this.options.prepareModels) {
        await this.options.prepareModels();
        this.check(workspace, token);
      }
      await run(workspace);
    });
    this.pending = result.catch(() => {});
    return result;
  }

  private async waitForAgent(workspace: string, token?: vscode.CancellationToken): Promise<void> {
    const command = 'workbench.action.chat.openxcsh';
    const deadline = Date.now() + (this.options.agentRegistrationTimeoutMs ?? 5000);
    for (;;) {
      this.check(workspace, token);
      const commands = await vscode.commands.getCommands(true);
      this.check(workspace, token);
      if (commands.includes(command)) {
        return;
      }
      if (Date.now() >= deadline) {
        throw new Error('NATIVE_AGENT_NOT_READY');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  private async selectAgent(
    workspace: string,
    token?: vscode.CancellationToken,
    attachments?: vscode.Uri[],
    clearDraft = false,
  ): Promise<void> {
    await this.waitForAgent(workspace, token);
    this.check(workspace, token);
    await vscode.commands.executeCommand('workbench.action.chat.openxcsh', {
      mode: this.options.agentUri.toString(),
      ...(attachments ? { attachFiles: attachments } : {}),
      ...(clearDraft ? { query: ' ', isPartialQuery: true } : {}),
    });
  }

  open(token?: vscode.CancellationToken): Promise<void> {
    return this.enqueue(async (workspace) => {
      await vscode.commands.executeCommand('workbench.action.chat.open');
      this.check(workspace, token);
      await this.selectAgent(workspace, token);
    }, token);
  }

  newSession(token?: vscode.CancellationToken): Promise<void> {
    return this.enqueue(async (workspace) => {
      await vscode.commands.executeCommand('workbench.action.chat.open');
      this.check(workspace, token);
      const commands = await vscode.commands.getCommands(true);
      this.check(workspace, token);
      if (!commands.includes('workbench.action.chat.openNewChatSessionInPlace.local')) {
        throw new Error('NATIVE_AGENT_NOT_READY');
      }
      // Preserve the current Local specialist when one is exposed. A different
      // harness cannot expose Local-only agents until Local is created.
      if (commands.includes('workbench.action.chat.openxcsh')) {
        await this.selectAgent(workspace, token);
      }
      this.check(workspace, token);
      // This native picker command creates Local directly. newLocalChat can be
      // redirected to the Copilot harness by editor preferences/treatments.
      await vscode.commands.executeCommand('workbench.action.chat.openNewChatSessionInPlace.local', 'sidebar');
      this.check(workspace, token);
      // Native empty-session reuse can retain its draft. Only the explicit New
      // Session entrypoint initializes an empty, unsubmitted input.
      await this.selectAgent(workspace, token, undefined, true);
    }, token);
  }

  attach(resource: { name: string; content: string }, token?: vscode.CancellationToken): Promise<void> {
    return this.enqueue(async (workspace) => {
      if (typeof resource?.name !== 'string' || typeof resource?.content !== 'string') {
        throw new Error('ATTACHMENT_INVALID');
      }
      if (Buffer.byteLength(resource.content, 'utf8') > 1024 * 1024) {
        throw new Error('ATTACHMENT_TOO_LARGE');
      }
      try {
        const value: unknown = JSON.parse(resource.content);
        if (value === null || typeof value !== 'object') {
          throw new Error('ATTACHMENT_INVALID');
        }
      } catch {
        throw new Error('ATTACHMENT_INVALID');
      }
      await vscode.commands.executeCommand('workbench.action.chat.open');
      this.check(workspace, token);
      await this.selectAgent(workspace, token);
      this.check(workspace, token);
      const stem =
        resource.name
          .normalize('NFKC')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 80) || 'resource';
      const name = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem) ? `resource_${stem}` : stem;
      const directory = join(this.options.storagePath, 'native-chat-attachments', randomUUID());
      await mkdir(directory, { recursive: true, mode: 0o700 });
      this.check(workspace, token);
      const filePath = join(directory, `${name}.json`);
      const file = await open(filePath, 'wx', 0o600);
      try {
        await file.writeFile(resource.content, 'utf8');
      } finally {
        await file.close();
      }
      this.check(workspace, token);
      await this.selectAgent(workspace, token, [vscode.Uri.file(filePath)]);
    }, token);
  }
}

/** Wire only after the pinned core and its native tool have successfully registered. */
export async function registerNativeChatCommands(
  context: vscode.ExtensionContext,
  options: NativeChatRouterOptions,
): Promise<boolean> {
  if (vscode.env.appName === 'Kiro' || !options.isAvailable()) {
    return false;
  }
  const commands = await vscode.commands.getCommands(true);
  if (!options.isAvailable()) {
    return false;
  }
  if (
    !['workbench.action.chat.open', 'workbench.action.chat.openNewChatSessionInPlace.local'].every((command) =>
      commands.includes(command),
    )
  ) {
    return false;
  }
  const ownedCommands = ['xcsh.xcsh.openPanel', 'xcsh.xcsh.newSession', 'xcsh.attachToChat'];
  if (ownedCommands.some((command) => commands.includes(command))) {
    return false;
  }
  const router = new NativeChatRouter(options);
  const invoke = async (run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      void vscode.window.showWarningMessage(
        error instanceof Error && error.message === 'NATIVE_CHAT_WINDOW_NOT_FOCUSED'
          ? vscode.l10n.t('Focus this workspace window before opening xcsh chat.')
          : vscode.l10n.t('Unable to open xcsh native chat. Verify the active workspace and try again.'),
      );
    }
  };
  const registrations: vscode.Disposable[] = [];
  try {
    registrations.push(vscode.commands.registerCommand('xcsh.xcsh.openPanel', () => invoke(() => router.open())));
    registrations.push(
      vscode.commands.registerCommand('xcsh.xcsh.newSession', () => invoke(() => router.newSession())),
    );
    registrations.push(
      vscode.commands.registerCommand('xcsh.attachToChat', (resource: { name: string; content: string }) =>
        invoke(() => router.attach(resource)),
      ),
    );
  } catch {
    for (const registration of registrations) {
      registration.dispose();
    }
    router.dispose();
    return false;
  }
  context.subscriptions.push(router, ...registrations);
  return true;
}
