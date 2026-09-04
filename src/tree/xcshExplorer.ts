// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { XCSHClient } from '../api/client';
import {
  BUILT_IN_NAMESPACES,
  getCategorizedResourceTypesForNamespace,
  getCategoryIcon,
  getCommonErrors,
  getDangerLevel,
  getOperationMetadata,
  getOperationPurpose,
  getPrerequisites,
  getResourceDomain,
  getResourceTypeTierRequirement,
  isResourceTypeAvailableForNamespace,
  isResourceTypePreview,
  RESOURCE_TYPES,
  type ResourceTypeInfo,
} from '../api/resourceTypes';
import type { ContextManager } from '../config/contextManager';
import type { XCSHContext } from '../config/contextTypes';
import {
  getDomainComplexity,
  getDomainMetadata,
  getDomainsForCategory,
  getDomainUseCases,
  type UiCategory,
} from '../generated/domainCategories';
import { XCSHApiError } from '../utils/errors';
import { getLocalizedDisplayName } from '../utils/l10nHelpers';
import { getLogger } from '../utils/logger';
import {
  type CategoryNodeData,
  type NamespaceNodeData,
  type ResourceNodeData,
  type ResourceTypeNodeData,
  TreeItemContext,
  type XCSHTreeItem,
} from './treeTypes';

/**
 * Tree data provider for the F5 XC Explorer view
 */
export class XCSHExplorerProvider implements vscode.TreeDataProvider<XCSHTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<XCSHTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly contextManager: ContextManager;
  private readonly clientFactory: (ctx: XCSHContext) => Promise<XCSHClient>;
  private readonly logger = getLogger();

  constructor(contextManager: ContextManager, clientFactory: (ctx: XCSHContext) => Promise<XCSHClient>) {
    this.contextManager = contextManager;
    this.clientFactory = clientFactory;
  }

  getTreeItem(element: XCSHTreeItem): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: XCSHTreeItem): Promise<XCSHTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    return element.getChildren();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private async getRootItems(): Promise<XCSHTreeItem[]> {
    const activeContext = await this.contextManager.getActiveContext();

    if (!activeContext) {
      return [];
    }

    try {
      const client = await this.clientFactory(activeContext);
      const namespaces = await client.listNamespaces();
      const available = new Set(namespaces.map((ns) => ns.name));

      const nodes: XCSHTreeItem[] = [];

      // Always-present built-in root namespaces (system, shared) in canonical order.
      for (const name of ROOT_BUILT_IN_NAMESPACES) {
        if (available.has(name)) {
          nodes.push(
            new NamespaceNode(
              { name, profileName: activeContext.name, isBuiltIn: true },
              this.clientFactory,
              this.contextManager,
            ),
          );
        }
      }

      // Single selectable/active tenant namespace (default, or a custom namespace).
      // Switching is handled by the inline action on this node (xcsh.selectActiveNamespace).
      const activeNamespace = activeContext.defaultNamespace || 'default';
      nodes.push(
        new NamespaceNode(
          { name: activeNamespace, profileName: activeContext.name, isActiveSelector: true },
          this.clientFactory,
          this.contextManager,
        ),
      );

      return nodes;
    } catch (error) {
      this.logger.error('resource.operation.failed');
      const failure = classifyExplorerError(error, activeContext.name);
      return [new ErrorNode(failure.title, failure.message, failure.command, failure.commandArguments)];
    }
  }
}

/**
 * Built-in namespaces shown as always-present, expandable root nodes. Excludes
 * `default`, which the tenant ships as its system-created namespace but which
 * otherwise behaves like any user namespace — it is chosen via the active-namespace
 * selector instead of being pinned at the root.
 */
const ROOT_BUILT_IN_NAMESPACES: readonly string[] = BUILT_IN_NAMESPACES.filter((n) => n !== 'default');

/**
 * Build the list of selectable tenant namespaces for the active-namespace picker:
 * every namespace except the always-shown root built-ins (`system`, `shared`), with
 * `default` first (the tenant's system-created namespace) then the rest alphabetically.
 */
export function buildSelectableNamespaces(names: string[]): string[] {
  const selectable = names.filter((n) => !ROOT_BUILT_IN_NAMESPACES.includes(n));
  const hasDefault = selectable.includes('default');
  const rest = selectable.filter((n) => n !== 'default').sort((a, b) => a.localeCompare(b));
  return hasDefault ? ['default', ...rest] : rest;
}

/** One choice offered by the default-namespace picker in the add-context flow. */
export interface NamespacePickChoice {
  /** Enumerated namespace name; empty for the trailing custom-entry option. */
  name: string;
  /** True only for the "enter a custom namespace" option shown last. */
  isCustom: boolean;
}

/**
 * Build the default-namespace picker choices for the add-context flow: the
 * selectable tenant namespaces (`default` first, then custom alphabetically,
 * `system`/`shared` hidden) followed by a custom-entry option so a namespace that
 * does not exist yet can still be typed. The custom option is always present, so
 * the picker is never empty.
 */
export function buildNamespacePickChoices(names: string[]): NamespacePickChoice[] {
  return [...buildSelectableNamespaces(names).map((name) => ({ name, isCustom: false })), { name: '', isCustom: true }];
}

/**
 * Namespace node in the tree
 */
export class NamespaceNode implements XCSHTreeItem {
  constructor(
    private readonly data: NamespaceNodeData,
    private readonly clientFactory: (ctx: XCSHContext) => Promise<XCSHClient>,
    private readonly contextManager: ContextManager,
  ) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.data.name, vscode.TreeItemCollapsibleState.Collapsed);
    // The active/selectable tenant namespace carries the inline switch action; the
    // built-in root namespaces (system, shared) are fixed.
    item.contextValue = this.data.isActiveSelector
      ? TreeItemContext.NAMESPACE_ACTIVE
      : TreeItemContext.NAMESPACE_BUILTIN;
    item.iconPath = new vscode.ThemeIcon(this.data.isActiveSelector ? 'folder-active' : 'folder');
    item.tooltip = `${vscode.l10n.t('Namespace name')}: ${this.data.name}`;
    return item;
  }

  getChildren(): Promise<XCSHTreeItem[]> {
    // Get categories filtered by namespace scope
    const categories = getCategorizedResourceTypesForNamespace(this.data.name);
    const nodes: XCSHTreeItem[] = [];

    for (const [category] of categories) {
      nodes.push(
        new CategoryNode(
          {
            category,
            namespace: this.data.name,
            profileName: this.data.profileName,
          },
          this.clientFactory,
          this.contextManager,
        ),
      );
    }

    return Promise.resolve(nodes);
  }

  /**
   * Get namespace node data for command handlers
   */
  getData(): NamespaceNodeData {
    return this.data;
  }
}

/**
 * Category node (Load Balancing, Security, etc.)
 */
class CategoryNode implements XCSHTreeItem {
  constructor(
    private readonly data: CategoryNodeData,
    private readonly clientFactory: (ctx: XCSHContext) => Promise<XCSHClient>,
    private readonly contextManager: ContextManager,
  ) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(vscode.l10n.t(this.data.category), vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = TreeItemContext.CATEGORY;
    item.iconPath = new vscode.ThemeIcon(getCategoryIcon(this.data.category));

    // Build enhanced tooltip with domain descriptions
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${vscode.l10n.t(this.data.category)}**\n\n`);

    // Get domains in this category and show their descriptions
    const domainsInCategory = getDomainsForCategory(this.data.category as UiCategory);
    if (domainsInCategory.length > 0) {
      // Show up to 3 domains with their icons and descriptions
      for (const domain of domainsInCategory.slice(0, 3)) {
        const meta = getDomainMetadata(domain);
        if (meta) {
          tooltip.appendMarkdown(`${meta.icon} **${meta.title.replace(/^xcsh /, '').replace(/ API$/, '')}**\n`);
          tooltip.appendMarkdown(`${meta.description_short}\n\n`);
        }
      }
      if (domainsInCategory.length > 3) {
        tooltip.appendMarkdown(`*...and ${domainsInCategory.length - 3} more*\n`);
      }
    } else {
      tooltip.appendMarkdown(`${this.data.category} resources`);
    }

    item.tooltip = tooltip;
    return item;
  }

  getChildren(): Promise<XCSHTreeItem[]> {
    // Filter by category AND namespace scope
    const types = Object.entries(RESOURCE_TYPES).filter(
      ([, info]) =>
        info.category === this.data.category && isResourceTypeAvailableForNamespace(info, this.data.namespace),
    );

    return Promise.resolve(
      types.map(
        ([key, info]) =>
          new ResourceTypeNode(
            {
              resourceType: info,
              resourceTypeKey: key,
              namespace: this.data.namespace,
              profileName: this.data.profileName,
            },
            this.clientFactory,
            this.contextManager,
          ),
      ),
    );
  }
}

/**
 * Resource type node (HTTP Load Balancers, Origin Pools, etc.)
 */
class ResourceTypeNode implements XCSHTreeItem {
  private readonly logger = getLogger();

  constructor(
    private readonly data: ResourceTypeNodeData,
    private readonly clientFactory: (ctx: XCSHContext) => Promise<XCSHClient>,
    private readonly contextManager: ContextManager,
  ) {}

  getTreeItem(): vscode.TreeItem {
    // Check for preview status
    const isPreview = isResourceTypePreview(this.data.resourceTypeKey);
    const tierRequirement = getResourceTypeTierRequirement(this.data.resourceTypeKey);

    // Add preview badge to display name if applicable
    const localizedName = getLocalizedDisplayName(this.data.resourceType.displayName);
    const displayName = isPreview ? `${localizedName} 🧪` : localizedName;

    const item = new vscode.TreeItem(displayName, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = `${TreeItemContext.RESOURCE_TYPE}:${this.data.resourceTypeKey}`;
    item.iconPath = new vscode.ThemeIcon(this.data.resourceType.icon);

    // Build enhanced tooltip with resource type information
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${localizedName}**`);
    if (isPreview) {
      tooltip.appendMarkdown(` 🧪 *${vscode.l10n.t('(Preview)')}*`);
    }
    tooltip.appendMarkdown('\n\n');

    if (this.data.resourceType.description) {
      tooltip.appendMarkdown(`${this.data.resourceType.description}\n\n`);
    }
    tooltip.appendMarkdown(`**${vscode.l10n.t('Category')}**: ${vscode.l10n.t(this.data.resourceType.category)}\n\n`);

    // Add tier requirement if applicable
    if (tierRequirement) {
      tooltip.appendMarkdown(`**${vscode.l10n.t('Requires')}**: ${tierRequirement} tier\n\n`);
    }

    // Add complexity level from domain metadata
    const domain = getResourceDomain(this.data.resourceTypeKey);
    if (domain) {
      const complexity = getDomainComplexity(domain);
      if (complexity) {
        const complexityLabel = complexity.charAt(0).toUpperCase() + complexity.slice(1);
        const complexityIcon = complexity === 'expert' ? '🔴' : complexity === 'advanced' ? '🟡' : '🟢';
        tooltip.appendMarkdown(`**${vscode.l10n.t('Complexity')}**: ${complexityIcon} ${complexityLabel}\n\n`);
      }

      // Add use cases (show first 3)
      const useCases = getDomainUseCases(domain);
      if (useCases.length > 0) {
        tooltip.appendMarkdown(`---\n\n**${vscode.l10n.t('Use Cases')}:**\n\n`);
        for (const useCase of useCases.slice(0, 3)) {
          tooltip.appendMarkdown(`• ${useCase}\n`);
        }
        tooltip.appendMarkdown(`\n`);
      }
    }

    // Add operation information
    const listPurpose = getOperationPurpose(this.data.resourceTypeKey, 'list');
    const createPurpose = getOperationPurpose(this.data.resourceTypeKey, 'create');
    const deleteDanger = getDangerLevel(this.data.resourceTypeKey, 'delete');

    tooltip.appendMarkdown(`---\n\n`);
    tooltip.appendMarkdown(`**${vscode.l10n.t('Available Operations')}:**\n\n`);
    if (listPurpose) {
      tooltip.appendMarkdown(`- ${vscode.l10n.t('List')}: ${listPurpose}\n`);
    }
    if (createPurpose) {
      tooltip.appendMarkdown(`- ${vscode.l10n.t('Create')}: ${createPurpose}\n`);
    }
    const dangerIcon = deleteDanger === 'high' ? '⚠️' : deleteDanger === 'medium' ? '⚡' : '✓';
    tooltip.appendMarkdown(
      `- ${vscode.l10n.t('Delete')}: ${dangerIcon} ${deleteDanger === 'high' ? vscode.l10n.t('High Risk') : deleteDanger === 'medium' ? vscode.l10n.t('Medium') : vscode.l10n.t('Low')}\n`,
    );

    // Add prerequisites from create operation
    const createPrereqs = getPrerequisites(this.data.resourceTypeKey, 'create');
    if (createPrereqs.length > 0) {
      tooltip.appendMarkdown(`\n**${vscode.l10n.t('Prerequisites')}**: ${createPrereqs.join(', ')}\n`);
    }

    // Add performance hint from discovered response time
    const listMeta = getOperationMetadata(this.data.resourceTypeKey, 'list');
    const responseTime = listMeta?.discoveredResponseTime;
    if (responseTime) {
      try {
        const parsed = JSON.parse(responseTime) as Record<string, unknown>;
        const p50 = parsed.p50_ms;
        const p95 = parsed.p95_ms;
        if (typeof p50 === 'number' || typeof p95 === 'number') {
          const parts: string[] = [];
          if (typeof p50 === 'number') {
            parts.push(`p50: ${p50}ms`);
          }
          if (typeof p95 === 'number') {
            parts.push(`p95: ${p95}ms`);
          }
          tooltip.appendMarkdown(`\n**${vscode.l10n.t('Response Time')}**: ${parts.join(', ')}\n`);
        }
      } catch {
        /* not parseable JSON */
      }
    }

    // Add domain context if available
    if (domain) {
      const domainMeta = getDomainMetadata(domain);
      if (domainMeta) {
        tooltip.appendMarkdown(`\n---\n\n`);
        tooltip.appendMarkdown(
          `${domainMeta.icon} *${vscode.l10n.t('Domain')}: ${domainMeta.title.replace(/^xcsh /, '').replace(/ API$/, '')}*\n`,
        );
      }
    }

    item.tooltip = tooltip;
    return item;
  }

  async getChildren(): Promise<XCSHTreeItem[]> {
    try {
      const ctx = await this.contextManager.getContext(this.data.profileName);
      if (!ctx) {
        return [];
      }

      const client = await this.clientFactory(ctx);
      const listOptions = XCSHClient.buildListOptions(this.data.resourceType);
      const resources = await client.listWithOptions(this.data.namespace, this.data.resourceType.apiPath, listOptions);

      return (
        resources
          .map((resource) => {
            // Handle multiple possible response structures from F5 XC API
            // The API may return: { metadata: { name } }, { name }, { get_spec: { name } }, etc.
            const resourceAny = resource as unknown as Record<string, unknown>;
            const metadata = resourceAny.metadata as Record<string, unknown> | undefined;
            const getSpec = resourceAny.get_spec as Record<string, unknown> | undefined;
            const objectData = resourceAny.object as Record<string, unknown> | undefined;
            const objectMetadata = objectData?.metadata as Record<string, unknown> | undefined;
            const getSpecMetadata = getSpec?.metadata as Record<string, unknown> | undefined;

            const name =
              (metadata?.name as string) ||
              (resourceAny.name as string) ||
              (resourceAny.userName as string) || // SCIM format
              (resourceAny.displayName as string) || // SCIM format fallback
              (getSpec?.name as string) ||
              (objectMetadata?.name as string) ||
              (getSpecMetadata?.name as string) ||
              'unknown';

            // Get resource's actual namespace from metadata - check multiple locations
            // Do NOT fallback to current namespace as that defeats the filter
            const resourceNamespace =
              (metadata?.namespace as string) ||
              (objectMetadata?.namespace as string) ||
              (getSpecMetadata?.namespace as string) ||
              (resourceAny.namespace as string) ||
              (getSpec?.namespace as string) ||
              null; // No fallback - if we can't find it, we'll log and exclude

            this.logger.debug('resource.operation.completed');

            if (name === 'unknown') {
              this.logger.warn('resource.operation.failed');
            }

            return {
              name,
              resourceNamespace,
              metadata: metadata || objectMetadata || {},
              fullResourceData: resourceAny, // Store full data for resources without GET endpoint
            };
          })
          // Filter out resources from different namespaces (e.g., shared namespace resources
          // showing up in other namespace listings)
          // If namespace couldn't be determined (null), exclude the resource to be safe
          // Skip filtering for resources that use non-standard APIs without namespace metadata (e.g., SCIM)
          .filter((r) => {
            if (this.data.resourceType.skipNamespaceFilter) {
              return true;
            }
            return r.resourceNamespace === this.data.namespace;
          })
          .map((r) => {
            return new ResourceNode({
              name: r.name,
              namespace: this.data.namespace,
              resourceType: this.data.resourceType,
              resourceTypeKey: this.data.resourceTypeKey,
              profileName: this.data.profileName,
              metadata: r.metadata,
              fullResourceData: this.data.resourceType.useListDataForDescribe ? r.fullResourceData : undefined,
            });
          })
      );
    } catch (error) {
      this.logger.error('resource.operation.failed');
      const failure = classifyExplorerError(error, this.data.profileName);
      return [new ErrorNode(failure.title, failure.message, failure.command, failure.commandArguments)];
    }
  }

  getData(): ResourceTypeNodeData {
    return this.data;
  }
}

/**
 * Individual resource node
 */
export class ResourceNode implements XCSHTreeItem {
  constructor(private readonly data: ResourceNodeData) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.data.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = `${TreeItemContext.RESOURCE}:${this.data.resourceTypeKey}`;
    item.iconPath = new vscode.ThemeIcon('file');

    // Build enhanced tooltip with operation metadata
    const deleteDanger = getDangerLevel(this.data.resourceTypeKey, 'delete');
    const deletePurpose = getOperationPurpose(this.data.resourceTypeKey, 'delete');
    const getPurpose = getOperationPurpose(this.data.resourceTypeKey, 'get');

    // Use MarkdownString for richer tooltip
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${getLocalizedDisplayName(this.data.resourceType.displayName)}**: ${this.data.name}\n\n`);
    tooltip.appendMarkdown(`**${vscode.l10n.t('Namespace name')}**: ${this.data.namespace}\n\n`);
    tooltip.appendMarkdown(`**${vscode.l10n.t('Category')}**: ${vscode.l10n.t(this.data.resourceType.category)}\n\n`);
    tooltip.appendMarkdown(`---\n\n`);
    tooltip.appendMarkdown(`**${vscode.l10n.t('Operations')}:**\n\n`);
    if (getPurpose) {
      tooltip.appendMarkdown(`- View: ${getPurpose}\n`);
    }
    // Show danger level with appropriate indicator
    const dangerIcon = deleteDanger === 'high' ? '⚠️' : deleteDanger === 'medium' ? '⚡' : '✓';
    const dangerText =
      deleteDanger === 'high'
        ? vscode.l10n.t('High Risk')
        : deleteDanger === 'medium'
          ? vscode.l10n.t('Medium')
          : vscode.l10n.t('Low');
    tooltip.appendMarkdown(`- ${vscode.l10n.t('Delete')}: ${dangerIcon} ${dangerText}`);
    if (deletePurpose) {
      tooltip.appendMarkdown(` - ${deletePurpose}`);
    }
    tooltip.appendMarkdown('\n');

    // Add common errors section (combine get and delete operations)
    const getErrors = getCommonErrors(this.data.resourceTypeKey, 'get');
    const deleteErrors = getCommonErrors(this.data.resourceTypeKey, 'delete');
    const allErrors = [...getErrors, ...deleteErrors];

    // Deduplicate by error code and show top 3
    const uniqueErrors = allErrors.filter(
      (error, index, self) => index === self.findIndex((e) => e.code === error.code),
    );

    if (uniqueErrors.length > 0) {
      tooltip.appendMarkdown(`\n---\n\n**${vscode.l10n.t('Common Issues')}:**\n\n`);
      for (const error of uniqueErrors.slice(0, 3)) {
        tooltip.appendMarkdown(`• **${error.code}**: ${error.solution || error.message}\n`);
      }
    }

    item.tooltip = tooltip;
    item.command = {
      command: 'xcsh.describe',
      title: 'Describe Resource',
      arguments: [this],
    };
    return item;
  }

  getChildren(): Promise<XCSHTreeItem[]> {
    return Promise.resolve([]); // Resources are leaf nodes
  }

  getData(): ResourceNodeData {
    return this.data;
  }

  get name(): string {
    return this.data.name;
  }

  get namespace(): string {
    return this.data.namespace;
  }

  get resourceType(): ResourceTypeInfo {
    return this.data.resourceType;
  }

  get resourceTypeKey(): string {
    return this.data.resourceTypeKey;
  }

  get profileName(): string {
    return this.data.profileName;
  }
}

/**
 * Error node for displaying connection/API errors in the tree
 */
interface ExplorerErrorPresentation {
  title: string;
  message: string;
  command: 'xcsh.editContext' | 'xcsh.refresh';
  commandArguments?: unknown[];
}

export function classifyExplorerError(error: unknown, contextName: string): ExplorerErrorPresentation {
  if (error instanceof XCSHApiError) {
    if (error.isUnauthorized) {
      return {
        title: vscode.l10n.t('Authentication failed'),
        message: vscode.l10n.t('The API token for context "{0}" was rejected. Click to edit it.', contextName),
        command: 'xcsh.editContext',
        commandArguments: [contextName],
      };
    }
    if (error.isForbidden) {
      return {
        title: vscode.l10n.t('Permission denied'),
        message: vscode.l10n.t('This token cannot list namespaces. Check its tenant permissions, then retry.'),
        command: 'xcsh.refresh',
      };
    }
    if (error.isRateLimited) {
      return {
        title: vscode.l10n.t('Rate limited'),
        message: vscode.l10n.t('The tenant is throttling requests. Wait briefly, then retry.'),
        command: 'xcsh.refresh',
      };
    }
    if (error.isServerError) {
      return {
        title: vscode.l10n.t('Server unavailable'),
        message: vscode.l10n.t('The tenant returned a server error. Try again shortly.'),
        command: 'xcsh.refresh',
      };
    }
    return {
      title: vscode.l10n.t('Request failed'),
      message: error.userFriendlyMessage,
      command: 'xcsh.refresh',
    };
  }

  const details = error instanceof Error ? error : undefined;
  const code = (details as (Error & { code?: string }) | undefined)?.code;
  if (
    details &&
    (details.name === 'AbortError' || code === 'ETIMEDOUT' || /timed?\s*out|timeout/i.test(details.message))
  ) {
    return {
      title: vscode.l10n.t('Request timed out'),
      message: vscode.l10n.t('Namespace discovery timed out. Check network access, then retry.'),
      command: 'xcsh.refresh',
    };
  }
  if (details) {
    return {
      title: vscode.l10n.t('Network error'),
      message: vscode.l10n.t('Could not reach the tenant. Check the API URL and network, then retry.'),
      command: 'xcsh.refresh',
    };
  }
  return {
    title: vscode.l10n.t('Failed to load namespaces'),
    message: vscode.l10n.t('Namespace discovery failed. Try again.'),
    command: 'xcsh.refresh',
  };
}

class ErrorNode implements XCSHTreeItem {
  constructor(
    private readonly title: string,
    private readonly message: string,
    private readonly retryCommand: string = 'xcsh.refresh',
    private readonly commandArguments?: unknown[],
  ) {}

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.title, vscode.TreeItemCollapsibleState.None);
    item.contextValue = TreeItemContext.ERROR;
    item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'));
    item.description =
      this.retryCommand === 'xcsh.editContext'
        ? vscode.l10n.t('Click to edit context')
        : vscode.l10n.t('Click to retry');
    item.tooltip = this.message;
    item.command = {
      command: this.retryCommand,
      title: this.retryCommand === 'xcsh.editContext' ? vscode.l10n.t('Edit Context') : vscode.l10n.t('Retry'),
      arguments: this.commandArguments,
    };
    return item;
  }

  getChildren(): Promise<XCSHTreeItem[]> {
    return Promise.resolve([]);
  }
}
