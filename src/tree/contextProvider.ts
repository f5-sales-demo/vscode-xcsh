// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import type { F5XCContext, TokenHealth } from '../config/contextTypes';
import { maskToken } from '../config/contextTypes';
import type { F5XCTreeItem } from './treeTypes';

/**
 * Tree data provider for the Contexts view
 */
export class ContextProvider implements vscode.TreeDataProvider<ContextTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ContextTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly contextManager: ContextManager) {
    // Listen for context changes and auto-refresh
    contextManager.onDidChangeContext(() => {
      this.refresh();
    });
  }

  getTreeItem(element: ContextTreeItem): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: ContextTreeItem): Promise<ContextTreeItem[]> {
    if (element) {
      return [];
    }

    const contexts = await this.contextManager.getContexts();
    const activeName = await this.contextManager.getActiveContextName();

    // Sort: active context first, then alphabetical
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

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
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
  ) {}

  getTreeItem(): vscode.TreeItem {
    const label = this.isActive ? `${this.context.name} ${vscode.l10n.t('(active)')}` : this.context.name;

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

    item.contextValue = 'context';
    item.iconPath = new vscode.ThemeIcon(this.getIcon());
    item.tooltip = this.buildTooltip();
    item.description = this.context.apiUrl;

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
