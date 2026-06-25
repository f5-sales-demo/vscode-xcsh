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
  NAMESPACE_GROUP: 'namespaceGroup',
  NAMESPACE: 'namespace',
  NAMESPACE_BUILTIN: 'namespace:builtin',
  NAMESPACE_CUSTOM: 'namespace:custom',
  CATEGORY: 'category',
  RESOURCE_TYPE: 'resourceType',
  RESOURCE: 'resource',
  // Subscription section contexts
  SUBSCRIPTION_GROUP: 'subscriptionGroup',
  SUBSCRIPTION_PLAN: 'subscriptionPlan',
  SUBSCRIPTION_QUOTAS: 'subscriptionQuotas',
  // Platform & Add-ons section contexts (non-namespace, tenant-level add-on infrastructure)
  ADDONS_GROUP: 'addonsGroup',
  ADDON_SUBSCRIBED: 'addon:subscribed',
  ADDON_UNSUBSCRIBED: 'addon:unsubscribed',
  ADDON_PENDING: 'addon:pending',
  // Error display
  ERROR: 'error',
} as const;

/**
 * Namespace node data
 */
export interface NamespaceNodeData {
  name: string;
  profileName: string;
  isBuiltIn?: boolean;
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
 * Add-on node data (Platform & Add-ons section). Represents a tenant-level add-on
 * service (e.g. DNS, Bot Defense Advanced) and its activation state.
 */
export interface AddonNodeData {
  /** Add-on service name (e.g. f5xc_bot_defense_advanced) */
  name: string;
  /** Human-readable name */
  displayName: string;
  /** Activation state from getAddonActivationStatus */
  subscribed: boolean;
  pending: boolean;
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
