// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Subscription tree data provider
 * Provides a separate top-level view for Plan and Quotas
 */

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { PlanNode, QuotasNode } from './subscriptionNodes';
import type { F5XCTreeItem } from './treeTypes';

/**
 * Tree data provider for the Subscription view
 * Shows Plan and Quotas as top-level items
 */
export class SubscriptionProvider implements vscode.TreeDataProvider<F5XCTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<F5XCTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly contextManager: ContextManager) {}

  getTreeItem(element: F5XCTreeItem): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: F5XCTreeItem): Promise<F5XCTreeItem[]> {
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
