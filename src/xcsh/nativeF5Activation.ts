// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../config/contextTypes';
import { registerNativeChatCommands } from './nativeChatRouter';
import { type NativeF5CoreFactory, NativeF5Tool, registerNativeF5Tool } from './nativeF5Tools';
import { ManagedWorkspaceAgent } from './nativeWorkspaceAgent';

export interface NativeF5ChatOptions {
  readonly createCore: NativeF5CoreFactory;
  readonly agentDocument: string;
  readonly prepareModels?: () => Promise<void>;
  readonly probeCli?: (executable: string) => Promise<'unavailable' | 'incompatible' | 'compatible'>;
}

const entrypoints = ['xcsh.xcsh.openPanel', 'xcsh.xcsh.newSession', 'xcsh.attachToChat'];

/** Owns native registrations independently of the optional CLI process. */
export class NativeF5ChatRegistration implements vscode.Disposable {
  private readonly owned: vscode.Disposable[] = [];
  private readonly registrationContext = { subscriptions: this.owned } as vscode.ExtensionContext;
  private readonly workspaceUri =
    vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0]?.uri : undefined;
  private rootIdentity: { realPath: string; device: number; inode: number } | undefined;
  private toolReady = false;
  private commandsReady = false;
  private stopped = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    if (this.workspaceUri?.scheme === 'file') {
      try {
        const stat = lstatSync(this.workspaceUri.fsPath);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          this.rootIdentity = { realPath: realpathSync(this.workspaceUri.fsPath), device: stat.dev, inode: stat.ino };
        }
      } catch {
        // A missing workspace is not a reason to change contexts or create files.
      }
    }
  }

  get disposed(): boolean {
    return this.stopped;
  }

  private eligible(): boolean {
    if (
      this.stopped ||
      !vscode.workspace.isTrusted ||
      !this.workspaceUri ||
      !this.rootIdentity ||
      vscode.workspace.getConfiguration('xcsh').get<boolean>('xcsh.enabled', true) === false
    ) {
      return false;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length !== 1 || folders[0]?.uri.toString() !== this.workspaceUri.toString()) {
      return false;
    }
    try {
      const stat = lstatSync(this.workspaceUri.fsPath);
      return (
        stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.dev === this.rootIdentity.device &&
        stat.ino === this.rootIdentity.inode &&
        realpathSync(this.workspaceUri.fsPath) === this.rootIdentity.realPath
      );
    } catch {
      return false;
    }
  }

  get ready(): boolean {
    return this.toolReady && this.commandsReady && this.eligible();
  }

  private reset(): void {
    this.toolReady = false;
    this.commandsReady = false;
    for (const registration of this.owned.splice(0).reverse()) {
      registration.dispose();
    }
  }

  dispose(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.reset();
  }

  private unavailable(): void {
    if (this.stopped) {
      return;
    }
    for (const command of entrypoints) {
      this.owned.push(
        vscode.commands.registerCommand(command, () => {
          void vscode.window.showWarningMessage(
            vscode.l10n.t(
              'xcsh native chat is unavailable in this workspace. Use a trusted local workspace and preserve the xcsh agent file.',
            ),
          );
          return false;
        }),
      );
    }
  }

  async initialize(manager: ContextManagerInterface, options: NativeF5ChatOptions): Promise<void> {
    if (!this.eligible() || !this.context.storageUri) {
      this.unavailable();
      return;
    }
    const workspaceRoot = (): string => {
      if (!this.ready || !this.workspaceUri) {
        throw new Error('CONTEXT_UNAVAILABLE');
      }
      return this.workspaceUri.fsPath;
    };
    const tool = new NativeF5Tool(
      manager,
      workspaceRoot,
      join(this.context.storageUri.fsPath, 'native-f5-receipts'),
      options.createCore,
    );
    try {
      this.toolReady = registerNativeF5Tool(this.registrationContext, tool);
      if (!this.toolReady) {
        throw new Error('NATIVE_TOOL_UNAVAILABLE');
      }
      const agent = new ManagedWorkspaceAgent({
        document: options.agentDocument,
        isAvailable: () => this.toolReady && this.eligible(),
      });
      this.owned.push(agent);
      const agentUri = await agent.ensure();
      if (this.stopped) {
        return;
      }
      this.commandsReady = await registerNativeChatCommands(this.registrationContext, {
        agentUri,
        storagePath: this.context.storageUri.fsPath,
        workspace: () => this.workspaceUri?.toString(),
        isAvailable: () => this.toolReady && this.eligible(),
        verifyAgent: (token) => agent.verify(token),
        prepareModels: options.prepareModels,
      });
      if (!this.commandsReady) {
        throw new Error('NATIVE_COMMANDS_UNAVAILABLE');
      }
    } catch {
      this.reset();
      this.unavailable();
    }
  }
}

/** Missing editor APIs retain existing host support; failed native candidates stay gated. */
export async function registerNativeF5Chat(
  context: vscode.ExtensionContext,
  manager: ContextManagerInterface,
  options: NativeF5ChatOptions,
): Promise<NativeF5ChatRegistration | undefined> {
  if (vscode.env.appName === 'Kiro' || typeof vscode.lm?.registerTool !== 'function') {
    return undefined;
  }
  const commands = await vscode.commands.getCommands(true);
  if (
    !['workbench.action.chat.open', 'workbench.action.chat.openNewChatSessionInPlace.local'].every((command) =>
      commands.includes(command),
    )
  ) {
    return undefined;
  }
  const registration = new NativeF5ChatRegistration(context);
  context.subscriptions.push(registration);
  // Do not replace handlers owned by another contributor or register them twice.
  if (!entrypoints.some((command) => commands.includes(command))) {
    await registration.initialize(manager, options);
  }
  return registration;
}
