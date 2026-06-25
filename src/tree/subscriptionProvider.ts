// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Subscription tree data provider
 * Provides a separate top-level view for Plan and Quotas
 */

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { PlanNode, QuotasNode } from './subscriptionNodes';
import type { XCSHTreeItem } from './treeTypes';

/**
 * Tree data provider for the Subscription view
 * Shows Plan and Quotas as top-level items
 */
export class SubscriptionProvider implements vscode.TreeDataProvider<XCSHTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<XCSHTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly contextManager: ContextManager) {}

  getTreeItem(element: XCSHTreeItem): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: XCSHTreeItem): Promise<XCSHTreeItem[]> {
    if (element) {
      return element.getChildren();
    }

    // Root level - return Plan and Quotas nodes if there's an active profile
    const activeContext = await this.contextManager.getActiveContext();
    if (!activeContext) {
      return [];
    }

    return [new PlanNode(activeContext.name), new QuotasNode(activeContext.name)];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
