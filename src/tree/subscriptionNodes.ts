// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Subscription tree nodes for Plan and Quota sections
 */

import * as vscode from 'vscode';
import { TreeItemContext, type XCSHTreeItem } from './treeTypes';

/**
 * Plan node - displays current subscription tier and addons
 * Opens Plan dashboard webview on click
 */
export class PlanNode implements XCSHTreeItem {
  constructor(private readonly profileName: string) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(vscode.l10n.t('Plan'), vscode.TreeItemCollapsibleState.None);
    item.contextValue = TreeItemContext.SUBSCRIPTION_PLAN;
    item.iconPath = new vscode.ThemeIcon('file-text');
    item.tooltip = vscode.l10n.t('View subscription plan details and addon services');
    item.command = {
      command: 'xcsh.showPlan',
      title: 'Show Subscription Plan',
      arguments: [this.profileName],
    };
    return item;
  }

  getChildren(): Promise<XCSHTreeItem[]> {
    // Leaf node - no children
    return Promise.resolve([]);
  }

  get profile(): string {
    return this.profileName;
  }
}

/**
 * Quotas node - displays resource usage vs limits
 * Opens Quotas dashboard webview on click
 */
export class QuotasNode implements XCSHTreeItem {
  constructor(private readonly profileName: string) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(vscode.l10n.t('Quotas'), vscode.TreeItemCollapsibleState.None);
    item.contextValue = TreeItemContext.SUBSCRIPTION_QUOTAS;
    item.iconPath = new vscode.ThemeIcon('graph');
    item.tooltip = vscode.l10n.t('View resource quota usage and limits');
    item.command = {
      command: 'xcsh.showQuotas',
      title: 'Show Quota Usage',
      arguments: [this.profileName],
    };
    return item;
  }

  getChildren(): Promise<XCSHTreeItem[]> {
    // Leaf node - no children
    return Promise.resolve([]);
  }

  get profile(): string {
    return this.profileName;
  }
}
