// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type * as vscode from 'vscode';
import type { ResourceCategory, ResourceTypeInfo } from '../api/resourceTypes';

/**
 * Base interface for all tree items
 */
export interface XCSHTreeItem {
  /** Get the VSCode TreeItem representation */
  getTreeItem(): vscode.TreeItem;

  /** Get child items */
  getChildren(): Promise<XCSHTreeItem[]>;
}

/**
 * Context value prefixes for tree items
 */
export const TreeItemContext = {
  /** Always-present built-in namespaces shown at the tree root (system, shared) */
  NAMESPACE_BUILTIN: 'namespace:builtin',
  /** The single selectable/active tenant namespace (default or a custom namespace) */
  NAMESPACE_ACTIVE: 'namespace:active',
  CATEGORY: 'category',
  RESOURCE_TYPE: 'resourceType',
  RESOURCE: 'resource',
  // Subscription section contexts
  SUBSCRIPTION_GROUP: 'subscriptionGroup',
  SUBSCRIPTION_PLAN: 'subscriptionPlan',
  SUBSCRIPTION_QUOTAS: 'subscriptionQuotas',
  // Error display
  ERROR: 'error',
} as const;

/**
 * Namespace node data
 */
export interface NamespaceNodeData {
  name: string;
  profileName: string;
  /** True for the always-present built-in root namespaces (system, shared) */
  isBuiltIn?: boolean;
  /** True for the single selectable/active tenant namespace node (shows the switch action) */
  isActiveSelector?: boolean;
}

/**
 * Category node data
 */
export interface CategoryNodeData {
  category: ResourceCategory;
  namespace: string;
  profileName: string;
}

/**
 * Resource type node data
 */
export interface ResourceTypeNodeData {
  resourceType: ResourceTypeInfo;
  resourceTypeKey: string;
  namespace: string;
  profileName: string;
}

/**
 * Resource node data
 */
export interface ResourceNodeData {
  name: string;
  namespace: string;
  resourceType: ResourceTypeInfo;
  resourceTypeKey: string;
  profileName: string;
  metadata?: Record<string, unknown>;
  /** Full resource data from list response (for resources without GET endpoint) */
  fullResourceData?: Record<string, unknown>;
}
