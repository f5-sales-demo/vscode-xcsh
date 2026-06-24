// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { getLocalContextsDir } from '../config/contextPaths';
import { isPointerContext, mergePointerOverrides } from '../config/contextResolver';
import type { F5XCContext, TokenHealth } from '../config/contextTypes';
import { maskToken } from '../config/contextTypes';
import type { F5XCTreeItem } from './treeTypes';

/** Union type for tree nodes returned by this provider. */
type ContextNode = ContextTreeItem | ContextGroupItem;

/**
 * Collapsible parent node that groups contexts under
 * "Project Contexts" or "Global Contexts".
 */
export class ContextGroupItem implements F5XCTreeItem {
  constructor(
    private readonly label: string,
    private readonly children: ContextTreeItem[],
  ) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'contextGroup';
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }

  getChildren(): Promise<F5XCTreeItem[]> {
    return Promise.resolve(this.children);
  }
}

/**
 * Tree data provider for the Contexts view
 */
export class ContextProvider implements vscode.TreeDataProvider<ContextNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ContextNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceFolder: string | undefined;

  constructor(private readonly contextManager: ContextManager) {
    // Listen for context changes and auto-refresh
    contextManager.onDidChangeContext(() => {
      this.refresh();
    });
  }

  /** Set the workspace folder for local context resolution. */
  setWorkspaceFolder(folder: string): void {
    this.workspaceFolder = folder;
    this.refresh();
  }

  getTreeItem(element: ContextNode): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: ContextNode): Promise<ContextNode[]> {
    // Child of a group node — return its children
    if (element instanceof ContextGroupItem) {
      return element.getChildren() as Promise<ContextNode[]>;
    }

    // Leaf ContextTreeItem — no children
    if (element instanceof ContextTreeItem) {
      return [];
    }

    // Root level
    if (this.workspaceFolder && this.hasLocalContextsDir(this.workspaceFolder)) {
      return this.getGroupedChildren(this.workspaceFolder);
    }

    // Flat list (existing behavior)
    return this.getFlatChildren();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  // ───────── private helpers ─────────

  /** Check whether the workspace has a `.xcsh/contexts/` directory. */
  private hasLocalContextsDir(workspaceFolder: string): boolean {
    const dir = getLocalContextsDir(workspaceFolder);
    return fs.existsSync(dir);
  }

  /** Build grouped tree: "Project Contexts" + "Global Contexts". */
  private async getGroupedChildren(workspaceFolder: string): Promise<ContextGroupItem[]> {
    const [localActiveName, globalContexts, globalActiveName] = await Promise.all([
      this.contextManager.getLocalActiveContextName(workspaceFolder),
      this.contextManager.getContexts(),
      this.contextManager.getActiveContextName(),
    ]);

    const projectItems = this.buildLocalContextItems(workspaceFolder, localActiveName, globalContexts);
    const globalItems = this.buildContextItems(globalContexts, globalActiveName);

    return [
      new ContextGroupItem('Project Contexts', projectItems),
      new ContextGroupItem('Global Contexts', globalItems),
    ];
  }

  /** Build flat list of ContextTreeItem (original behavior). */
  private async getFlatChildren(): Promise<ContextTreeItem[]> {
    const contexts = await this.contextManager.getContexts();
    const activeName = await this.contextManager.getActiveContextName();

    return this.buildContextItems(contexts, activeName);
  }

  /**
   * Sort and map contexts to ContextTreeItem instances.
   * Used for global contexts and the flat (ungrouped) view.
   */
  private buildContextItems(contexts: F5XCContext[], activeName: string | null): ContextTreeItem[] {
    const sorted = [...contexts].sort((a, b) => {
      if (a.name === activeName) {
        return -1;
      }
      if (b.name === activeName) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return sorted.map((ctx) => {
      const isActive = ctx.name === activeName;
      const health = this.contextManager.getTokenHealth(ctx);
      return new ContextTreeItem(ctx, isActive, health);
    });
  }

  /**
   * Read local context JSON files, resolve pointers against the
   * provided global contexts, and return sorted ContextTreeItem
   * instances with pointer annotations.
   */
  private buildLocalContextItems(
    workspaceFolder: string,
    activeName: string | null,
    globalContexts: F5XCContext[],
  ): ContextTreeItem[] {
    const localDir = getLocalContextsDir(workspaceFolder);
    if (!fs.existsSync(localDir)) {
      return [];
    }

    const globalMap = new Map(globalContexts.map((g) => [g.name, g]));
    const files = fs.readdirSync(localDir).filter((f) => f.endsWith('.json'));

    interface LocalEntry {
      ctx: F5XCContext;
      pointerTarget?: string;
    }

    const entries: LocalEntry[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(localDir, file), 'utf-8');
        const data: unknown = JSON.parse(raw);

        if (isPointerContext(data)) {
          const globalCtx = globalMap.get(data.context);
          if (!globalCtx) {
            continue; // dangling pointer — skip
          }
          const resolved = data.overrides ? mergePointerOverrides(globalCtx, data.overrides) : globalCtx;
          entries.push({ ctx: { ...resolved, name: data.context }, pointerTarget: data.context });
        } else {
          entries.push({ ctx: data as F5XCContext });
        }
      } catch {
        /* skip unreadable files */
      }
    }

    entries.sort((a, b) => {
      if (a.ctx.name === activeName) {
        return -1;
      }
      if (b.ctx.name === activeName) {
        return 1;
      }
      return a.ctx.name.localeCompare(b.ctx.name);
    });

    return entries.map((entry) => {
      const isActive = entry.ctx.name === activeName;
      const health = this.contextManager.getTokenHealth(entry.ctx);
      return new ContextTreeItem(entry.ctx, isActive, health, entry.pointerTarget);
    });
  }
}

/**
 * Context tree item
 */
export class ContextTreeItem implements F5XCTreeItem {
  constructor(
    private readonly context: F5XCContext,
    private readonly isActive: boolean,
    private readonly health: TokenHealth,
    private readonly pointerTarget?: string,
  ) {}

  getTreeItem(): vscode.TreeItem {
    const label = this.isActive ? `${this.context.name} ${vscode.l10n.t('(active)')}` : this.context.name;

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

    item.contextValue = 'context';
    item.iconPath = new vscode.ThemeIcon(this.getIcon());
    item.tooltip = this.buildTooltip();
    item.description = this.pointerTarget ? `→ global:${this.pointerTarget}` : this.context.apiUrl;

    // Click to activate context (only if not already active)
    if (!this.isActive) {
      item.command = {
        command: 'f5xc.setActiveContext',
        title: 'Set as Active Context',
        arguments: [this],
      };
    }

    return item;
  }

  getChildren(): Promise<F5XCTreeItem[]> {
    return Promise.resolve([]);
  }

  getContext(): F5XCContext {
    return this.context;
  }

  private getIcon(): string {
    if (this.isActive) {
      // Health-based icons for the active context
      switch (this.health) {
        case 'expired':
          return 'error';
        case 'expiring':
          return 'warning';
        default:
          return 'pass-filled';
      }
    }
    return 'account';
  }

  private buildTooltip(): string {
    const lines = [
      `${vscode.l10n.t('Name')}: ${this.context.name}`,
      `${vscode.l10n.t('URL')}: ${this.context.apiUrl}`,
      `${vscode.l10n.t('Token')}: ${maskToken(this.context.apiToken)}`,
      `${vscode.l10n.t('Namespace')}: ${this.context.defaultNamespace}`,
    ];

    if (this.pointerTarget) {
      lines.push(`${vscode.l10n.t('Points to')}: global:${this.pointerTarget}`);
    }

    if (this.context.metadata?.expiresAt) {
      lines.push(`${vscode.l10n.t('Expires')}: ${this.context.metadata.expiresAt}`);
    }

    lines.push(`${vscode.l10n.t('Health')}: ${this.health}`);

    if (this.isActive) {
      lines.push(vscode.l10n.t('Status: Active'));
    }

    return lines.join('\n');
  }
}
