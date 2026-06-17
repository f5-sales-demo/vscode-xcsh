// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { Resource } from '../api/client';
import {
  getDangerLevel,
  getFieldDefaults,
  getPrerequisites,
  getRecommendedValueFields,
  getRecommendedValues,
  getResourceTypeByApiPath,
  getServerDefaultFields,
  getSideEffects,
  isBuiltInNamespace,
  RESOURCE_TYPES,
  requiresConfirmation,
} from '../api/resourceTypes';
import type { ContextManager } from '../config/contextManager';
import type { F5XCDescribeProvider } from '../providers/f5xcDescribeProvider';
import { F5XCFileSystemProvider } from '../providers/f5xcFileSystemProvider';
import { F5XCViewProvider } from '../providers/f5xcViewProvider';
import type { F5XCExplorerProvider, NamespaceNode, ResourceNode } from '../tree/f5xcExplorer';
import type { ResourceNodeData } from '../tree/treeTypes';
import { showInfo, showWarning, withErrorHandling } from '../utils/errors';
import { getLocalizedDisplayName } from '../utils/l10nHelpers';
import { getLogger } from '../utils/logger';
import { filterResource, getFilterOptionsForViewMode, type ViewMode } from '../utils/resourceFilter';
import { validateResourcePayload } from '../utils/validation';

const logger = getLogger();

/**
 * Data passed from webview when clicking "Edit Configuration"
 */
interface WebviewResourceData {
  profileName: string;
  namespace: string;
  resourceType: string; // apiPath from describe view
  resourceName: string;
}

/**
 * Type guard to check if argument is a ResourceNode (has getData method)
 */
function isResourceNode(arg: unknown): arg is ResourceNode {
  return (
    typeof arg === 'object' && arg !== null && 'getData' in arg && typeof (arg as ResourceNode).getData === 'function'
  );
}

/**
 * Get the current view mode from settings
 */
function getViewMode(): ViewMode {
  return vscode.workspace.getConfiguration('f5xc').get<ViewMode>('viewMode', 'console');
}

/**
 * Register CRUD commands for F5 XC resources
 */
export function registerCrudCommands(
  context: vscode.ExtensionContext,
  explorer: F5XCExplorerProvider,
  contextManager: ContextManager,
  fsProvider: F5XCFileSystemProvider,
  viewProvider: F5XCViewProvider,
  describeProvider: F5XCDescribeProvider,
): void {
  // GET - View resource as JSON (read-only)
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.get', async (node: ResourceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();
        const profile = await contextManager.getContext(data.profileName);

        if (!profile) {
          showWarning(vscode.l10n.t('Context "{0}" not found', data.profileName));
          return;
        }

        // Create f5xc-view:// URI for read-only viewing
        const uri = F5XCViewProvider.createUri(data.profileName, data.namespace, data.resourceType.apiPath, data.name);

        // Refresh the content to ensure fresh data
        viewProvider.refresh(uri);

        // Open the document using the f5xc-view:// content provider
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });

        const viewMode = getViewMode();
        logger.info(`Viewing resource: ${data.name} (view mode: ${viewMode})`);
      }, 'View resource');
    }),
  );

  // DESCRIBE - Show formatted resource description in WebView
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.describe', async (node: ResourceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();

        await describeProvider.showDescribe(
          data.profileName,
          data.namespace,
          data.resourceType.apiPath,
          data.name,
          data.fullResourceData,
        );

        logger.info(`Describing resource: ${data.name}`);
      }, 'Describe resource');
    }),
  );

  // EDIT - Open resource for editing using f5xc:// virtual file system
  // Supports both ResourceNode (from tree view) and WebviewResourceData (from describe webview)
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.edit', async (arg: ResourceNode | WebviewResourceData) => {
      await withErrorHandling(async () => {
        let data: ResourceNodeData;

        if (isResourceNode(arg)) {
          // Called from tree view with ResourceNode
          data = arg.getData();
        } else {
          // Called from webview with plain object
          const resourceType = getResourceTypeByApiPath(arg.resourceType);
          if (!resourceType) {
            showWarning(vscode.l10n.t('Unknown resource type: {0}', arg.resourceType));
            return;
          }

          // Find the resourceTypeKey from RESOURCE_TYPES
          const resourceTypeKey = Object.entries(RESOURCE_TYPES).find(
            ([, info]) => info.apiPath === arg.resourceType,
          )?.[0];

          if (!resourceTypeKey) {
            showWarning(vscode.l10n.t('Could not find resource type key for: {0}', arg.resourceType));
            return;
          }

          data = {
            name: arg.resourceName,
            namespace: arg.namespace,
            resourceType: resourceType,
            resourceTypeKey: resourceTypeKey,
            profileName: arg.profileName,
          };
        }

        const profile = await contextManager.getContext(data.profileName);

        if (!profile) {
          showWarning(vscode.l10n.t('Context "{0}" not found', data.profileName));
          return;
        }

        // Create f5xc:// URI for the resource
        const uri = F5XCFileSystemProvider.createUri(data.profileName, data.namespace, data.resourceTypeKey, data.name);

        // Clear any cached content to ensure fresh data
        fsProvider.clearCache(uri);

        // Open the document using the f5xc:// file system
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });

        logger.info(`Editing resource: ${data.name}`);
        showInfo(vscode.l10n.t('Editing {0}. Press Cmd+S to save changes.', data.name));
      }, 'Edit resource');
    }),
  );

  // CREATE - Create new resource from template
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.create', async (arg?: unknown) => {
      await withErrorHandling(async () => {
        // Determine resource type from context or prompt user
        let resourceTypeKey: string | undefined;
        let namespace = 'default';

        // If called from tree view with resource type context
        if (arg && typeof arg === 'object' && 'getData' in arg) {
          const nodeData = (arg as { getData: () => { resourceTypeKey: string; namespace: string } }).getData();
          resourceTypeKey = nodeData.resourceTypeKey;
          namespace = nodeData.namespace;
        }

        // If no resource type, prompt user to select
        if (!resourceTypeKey) {
          const items = Object.entries(RESOURCE_TYPES).map(([key, info]) => ({
            label: getLocalizedDisplayName(info.displayName),
            description: vscode.l10n.t(info.category),
            detail: info.description,
            key,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t('Select resource type to create'),
            matchOnDescription: true,
            matchOnDetail: true,
          });

          if (!selected) {
            return;
          }

          resourceTypeKey = selected.key;
        }

        const resourceType = RESOURCE_TYPES[resourceTypeKey];
        if (!resourceType) {
          showWarning(vscode.l10n.t('Unknown resource type: {0}', resourceTypeKey));
          return;
        }

        // Show prerequisites notice if any exist for create operation
        const prerequisites = getPrerequisites(resourceTypeKey, 'create');
        if (prerequisites.length > 0) {
          const prereqList = prerequisites.join(', ');
          const proceed = await vscode.window.showInformationMessage(
            vscode.l10n.t(
              'Prerequisites for creating {0}: {1}',
              getLocalizedDisplayName(resourceType.displayName),
              prereqList,
            ),
            { modal: false },
            vscode.l10n.t('Continue'),
            vscode.l10n.t('Cancel'),
          );
          if (proceed === vscode.l10n.t('Cancel')) {
            return;
          }
        }

        // Get namespace
        const namespaceInput = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Enter namespace'),
          value: namespace,
          placeHolder: 'default',
        });

        if (!namespaceInput) {
          return;
        }

        // Create template
        const template = createResourceTemplate(resourceTypeKey, namespaceInput);
        const content = JSON.stringify(template, null, 2);

        // Create document
        const doc = await vscode.workspace.openTextDocument({
          content,
          language: 'json',
        });

        await vscode.window.showTextDocument(doc, { preview: false });
        showInfo(
          vscode.l10n.t(
            'Created template for {0}. Edit and use "xcsh: Apply" to create.',
            getLocalizedDisplayName(resourceType.displayName),
          ),
        );
      }, 'Create resource');
    }),
  );

  // APPLY - Create or update resource from current editor
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.apply', async () => {
      await withErrorHandling(async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          showWarning(vscode.l10n.t('No active editor'));
          return;
        }

        const document = editor.document;
        const content = document.getText();

        let resource: { metadata?: { name?: string; namespace?: string }; spec?: unknown };
        try {
          resource = JSON.parse(content) as typeof resource;
        } catch {
          showWarning(vscode.l10n.t('Invalid JSON in editor'));
          return;
        }

        const namespace = resource.metadata?.namespace;
        const name = resource.metadata?.name;

        if (!namespace || !name) {
          showWarning(vscode.l10n.t('Resource must have metadata.namespace and metadata.name'));
          return;
        }

        // Detect resource type from file name or content
        const resourceTypeKey = detectResourceType(document.fileName, resource);
        if (!resourceTypeKey) {
          showWarning(vscode.l10n.t('Could not determine resource type. Use naming convention: *.{type}.f5xc.json'));
          return;
        }

        const resourceType = RESOURCE_TYPES[resourceTypeKey];
        if (!resourceType) {
          showWarning(vscode.l10n.t('Unknown resource type: {0}', resourceTypeKey));
          return;
        }

        // Get active profile
        const activeContext = await contextManager.getActiveContext();
        if (!activeContext) {
          showWarning(vscode.l10n.t('No active context. Configure a context first.'));
          return;
        }

        const client = await contextManager.getClient(activeContext.name);
        const apiBase = resourceType.apiBase || 'config';
        const serviceSegment = resourceType.serviceSegment;

        // Try to get existing resource to determine create vs update
        let exists = false;
        try {
          await client.get(namespace, resourceType.apiPath, name, undefined, apiBase, serviceSegment);
          exists = true;
        } catch {
          exists = false;
        }

        // Validate the resource payload before proceeding
        const operation = exists ? 'update' : 'create';
        const validationResult = validateResourcePayload(resourceTypeKey, operation, resource);

        // If validation fails, show warning with option to continue
        if (!validationResult.valid) {
          const warningMessage = vscode.l10n.t(
            '{0}\n\nDo you want to continue anyway?',
            validationResult.warnings.join('\n\n'),
          );

          const continueAnyway = await vscode.window.showWarningMessage(
            warningMessage,
            { modal: true },
            vscode.l10n.t('Continue'),
            vscode.l10n.t('Cancel'),
          );

          if (continueAnyway !== vscode.l10n.t('Continue')) {
            return;
          }
        }

        // Show prerequisites notice for create operations
        if (!exists) {
          const createPrereqs = getPrerequisites(resourceTypeKey, 'create');
          if (createPrereqs.length > 0) {
            showInfo(`Prerequisites: ${createPrereqs.join(', ')}`);
          }
        }

        // Confirm action — use enhanced confirmation for high-danger operations
        const action = exists ? 'Update' : 'Create';
        const operationForConfirm: 'create' | 'update' = exists ? 'update' : 'create';
        const opDangerLevel = getDangerLevel(resourceTypeKey, operationForConfirm);
        const opRequiresConfirm = requiresConfirmation(resourceTypeKey, operationForConfirm);

        let confirmMessage = vscode.l10n.t(
          '{0} {1} "{2}" in namespace "{3}"?',
          action,
          getLocalizedDisplayName(resourceType.displayName),
          name,
          namespace,
        );
        if (opDangerLevel === 'high' || opRequiresConfirm) {
          const sideEffects = getSideEffects(resourceTypeKey, operationForConfirm);
          if (sideEffects) {
            const effects: string[] = [];
            if (sideEffects.creates?.length) {
              effects.push(`Creates: ${sideEffects.creates.join(', ')}`);
            }
            if (sideEffects.updates?.length) {
              effects.push(`Updates: ${sideEffects.updates.join(', ')}`);
            }
            if (sideEffects.invalidates?.length) {
              effects.push(`Invalidates: ${sideEffects.invalidates.join(', ')}`);
            }
            if (effects.length > 0) {
              confirmMessage += `\n\nThis will also affect:\n• ${effects.join('\n• ')}`;
            }
          }
        }

        const confirm = await vscode.window.showInformationMessage(confirmMessage, { modal: true }, action);

        if (confirm !== action) {
          return;
        }

        // Apply resource - cast to any since we've validated the required fields exist
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title:
              action === 'Update' ? vscode.l10n.t('Updating {0}...', name) : vscode.l10n.t('Creating {0}...', name),
            cancellable: false,
          },
          async () => {
            const resourceData = resource as Resource;
            if (exists) {
              await client.replace(namespace, resourceType.apiPath, name, resourceData, apiBase, serviceSegment);
            } else {
              await client.create(namespace, resourceType.apiPath, resourceData, apiBase, serviceSegment);
            }
          },
        );

        showInfo(vscode.l10n.t('{0}d {1}: {2}', action, getLocalizedDisplayName(resourceType.displayName), name));
        explorer.refresh();
      }, 'Apply resource');
    }),
  );

  // DELETE - Delete resource with RBAC pre-check
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.delete', async (node: ResourceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();
        const client = await contextManager.getClient(data.profileName);
        const apiBase = data.resourceType.apiBase || 'config';
        const serviceSegment = data.resourceType.serviceSegment;

        // Build the DELETE API path for RBAC check
        // Format: /api/{apiBase}/namespaces/{namespace}/{serviceSegment?}/{apiPath}/{name}
        let deletePath = `/api/${apiBase}/namespaces/${data.namespace}`;
        if (serviceSegment) {
          deletePath += `/${serviceSegment}`;
        }
        deletePath += `/${data.resourceType.apiPath}/${data.name}`;

        // Check RBAC permissions before showing confirmation
        const hasPermission = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Checking permissions...'),
            cancellable: false,
          },
          async () => {
            return client.checkApiAccess(data.namespace, [{ method: 'DELETE', path: deletePath }]);
          },
        );

        if (!hasPermission) {
          showWarning(
            vscode.l10n.t(
              'Permission denied: You do not have access to delete {0} "{1}".',
              getLocalizedDisplayName(data.resourceType.displayName),
              data.name,
            ),
          );
          return;
        }

        // Get danger level for the delete operation
        const dangerLevel = getDangerLevel(data.resourceTypeKey, 'delete');
        const metadataRequiresConfirm = requiresConfirmation(data.resourceTypeKey, 'delete');

        // Determine whether to show confirmation based on settings
        const config = vscode.workspace.getConfiguration('f5xc');
        const confirmDelete = config.get<boolean>('confirmDelete', true);
        const confirmationLevel = config.get<'always' | 'high-only' | 'never'>('deleteConfirmationLevel', 'always');

        // Determine if we should show confirmation
        // Operation metadata can force confirmation even when settings say otherwise
        let showConfirmation = confirmDelete; // Legacy setting takes precedence if false
        if (showConfirmation) {
          if (confirmationLevel === 'never') {
            showConfirmation = false;
          } else if (confirmationLevel === 'high-only') {
            showConfirmation = dangerLevel === 'high';
          }
          // 'always' keeps showConfirmation = true
        }
        // Override: always confirm if operation metadata explicitly requires it
        if (metadataRequiresConfirm) {
          showConfirmation = true;
        }

        if (showConfirmation) {
          const sideEffects = getSideEffects(data.resourceTypeKey, 'delete');

          // Build side effects text (shared across danger levels)
          let sideEffectsText = '';
          if (sideEffects) {
            const effects: string[] = [];
            if (sideEffects.deletes?.length) {
              effects.push(`Deletes: ${sideEffects.deletes.join(', ')}`);
            }
            if (sideEffects.updates?.length) {
              effects.push(`Updates: ${sideEffects.updates.join(', ')}`);
            }
            if (sideEffects.invalidates?.length) {
              effects.push(`Invalidates: ${sideEffects.invalidates.join(', ')}`);
            }
            if (effects.length > 0) {
              sideEffectsText = `\n\nThis will also affect:\n• ${effects.join('\n• ')}`;
            }
          }

          // Build confirmation message based on danger level
          let confirmMessage = vscode.l10n.t(
            'Delete {0} "{1}" from namespace "{2}"?',
            getLocalizedDisplayName(data.resourceType.displayName),
            data.name,
            data.namespace,
          );
          let confirmButton = vscode.l10n.t('Delete');

          if (dangerLevel === 'high') {
            // Enhanced warning for high-danger operations
            confirmMessage =
              vscode.l10n.t('HIGH RISK DELETE') +
              '\n\n' +
              vscode.l10n.t(
                'Delete {0} "{1}" from namespace "{2}"?',
                getLocalizedDisplayName(data.resourceType.displayName),
                data.name,
                data.namespace,
              ) +
              '\n\n' +
              vscode.l10n.t('This operation has danger level: HIGH') +
              sideEffectsText +
              '\n\n' +
              vscode.l10n.t('This action cannot be undone.');
            confirmButton = vscode.l10n.t('Delete (High Risk)');
          } else if (dangerLevel === 'medium') {
            // Standard confirmation with side effects for medium-danger operations
            confirmMessage += `${sideEffectsText}\n\n${vscode.l10n.t('This action cannot be undone.')}`;
          } else {
            // Low danger — include side effects if they exist
            if (sideEffectsText) {
              confirmMessage += sideEffectsText;
            }
          }

          const confirm = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            confirmButton,
            vscode.l10n.t('Cancel'),
          );

          if (confirm !== confirmButton) {
            return;
          }
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Deleting {0}...', data.name),
            cancellable: false,
          },
          async () => {
            await client.delete(data.namespace, data.resourceType.apiPath, data.name, false, apiBase, serviceSegment);
          },
        );

        showInfo(vscode.l10n.t('Deleted {0}: {1}', getLocalizedDisplayName(data.resourceType.displayName), data.name));
        explorer.refresh();
      }, 'Delete resource');
    }),
  );

  // DELETE NAMESPACE - Delete namespace and all resources (cascade delete)
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.deleteNamespace', async (node: NamespaceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();

        // Defense in depth: verify this is not a built-in namespace
        if (isBuiltInNamespace(data.name)) {
          showWarning(vscode.l10n.t('Cannot delete built-in namespace "{0}".', data.name));
          return;
        }

        const client = await contextManager.getClient(data.profileName);

        // Build the DELETE API path for RBAC check
        const deletePath = `/api/web/namespaces/${data.name}/cascade_delete`;

        // Check RBAC permissions before showing confirmation
        // Use the target namespace for permission evaluation
        const hasPermission = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Checking permissions...'),
            cancellable: false,
          },
          async () => {
            return client.checkApiAccess(data.name, [{ method: 'POST', path: deletePath }]);
          },
        );

        if (!hasPermission) {
          showWarning(vscode.l10n.t('Permission denied: You do not have access to delete namespace "{0}".', data.name));
          return;
        }

        // Confirm deletion with strong warning
        const confirm = await vscode.window.showWarningMessage(
          vscode.l10n.t('Are you sure you want to delete namespace "{0}"?', data.name) +
            '\n\n' +
            vscode.l10n.t(
              'WARNING: This will permanently delete ALL resources within this namespace. This action cannot be undone.',
            ),
          { modal: true },
          vscode.l10n.t('Delete Namespace'),
        );

        if (confirm !== vscode.l10n.t('Delete Namespace')) {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Deleting namespace {0} and all resources...', data.name),
            cancellable: false,
          },
          async () => {
            await client.cascadeDeleteNamespace(data.name);
          },
        );

        showInfo(vscode.l10n.t('Deleted namespace: {0}', data.name));
        explorer.refresh();
      }, 'Delete namespace');
    }),
  );

  // DESCRIBE NAMESPACE - Show namespace details in describe view
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.describeNamespace', async (node: NamespaceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();

        await describeProvider.showNamespaceDescribe(data.profileName, data.name);

        logger.info(`Describing namespace: ${data.name}`);
      }, 'Describe namespace');
    }),
  );

  // DIFF - Compare local with remote
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.diff', async (node?: ResourceNode) => {
      await withErrorHandling(async () => {
        let remoteContent: string;
        let localUri: vscode.Uri;
        let name: string;

        if (node) {
          // Called from tree view
          const data = node.getData();
          const client = await contextManager.getClient(data.profileName);
          const apiBase = data.resourceType.apiBase || 'config';
          const serviceSegment = data.resourceType.serviceSegment;
          const resource = await client.get(
            data.namespace,
            data.resourceType.apiPath,
            data.name,
            undefined,
            apiBase,
            serviceSegment,
          );
          remoteContent = JSON.stringify(resource, null, 2);
          name = data.name;

          // Check if there's an active editor with this resource
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            localUri = editor.document.uri;
          } else {
            showWarning(vscode.l10n.t('Open the resource in editor first to compare'));
            return;
          }
        } else {
          // Called from editor
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            showWarning(vscode.l10n.t('No active editor'));
            return;
          }

          localUri = editor.document.uri;
          const content = editor.document.getText();

          let resource: { metadata?: { name?: string; namespace?: string } };
          try {
            resource = JSON.parse(content) as typeof resource;
          } catch {
            showWarning(vscode.l10n.t('Invalid JSON in editor'));
            return;
          }

          const namespace = resource.metadata?.namespace;
          name = resource.metadata?.name || 'unknown';

          if (!namespace || !name) {
            showWarning(vscode.l10n.t('Resource must have metadata.namespace and metadata.name'));
            return;
          }

          const resourceTypeKey = detectResourceType(editor.document.fileName, resource);
          if (!resourceTypeKey) {
            showWarning(vscode.l10n.t('Could not determine resource type'));
            return;
          }

          const resourceType = RESOURCE_TYPES[resourceTypeKey];
          if (!resourceType) {
            showWarning(vscode.l10n.t('Unknown resource type: {0}', resourceTypeKey));
            return;
          }

          const activeContext = await contextManager.getActiveContext();
          if (!activeContext) {
            showWarning(vscode.l10n.t('No active context'));
            return;
          }

          const client = await contextManager.getClient(activeContext.name);
          const apiBase = resourceType.apiBase || 'config';
          const serviceSegmentFromType = resourceType.serviceSegment;
          const remoteResource = await client.get(
            namespace,
            resourceType.apiPath,
            name,
            undefined,
            apiBase,
            serviceSegmentFromType,
          );
          remoteContent = JSON.stringify(remoteResource, null, 2);
        }

        // Create virtual document for remote content
        const remoteUri = vscode.Uri.parse(`f5xc-remote:${name}.json`);

        // Register content provider if not already registered
        const provider = new (class implements vscode.TextDocumentContentProvider {
          provideTextDocumentContent(): string {
            return remoteContent;
          }
        })();

        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('f5xc-remote', provider));

        // Show diff
        await vscode.commands.executeCommand('vscode.diff', remoteUri, localUri, `${name} (Remote ↔ Local)`);
      }, 'Compare with remote');
    }),
  );

  // COPY NAME - Copy resource name to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.copyName', async (node: ResourceNode) => {
      const data = node.getData();
      await vscode.env.clipboard.writeText(data.name);
      showInfo(vscode.l10n.t('Copied: {0}', data.name));
    }),
  );

  // COPY AS JSON - Copy resource JSON to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.copyAsJson', async (node: ResourceNode) => {
      await withErrorHandling(async () => {
        const data = node.getData();
        const client = await contextManager.getClient(data.profileName);
        const apiBase = data.resourceType.apiBase || 'config';
        const resource = await client.get(data.namespace, data.resourceType.apiPath, data.name, undefined, apiBase);

        // Apply view mode filtering
        const viewMode = getViewMode();
        const filterOptions = getFilterOptionsForViewMode(viewMode);
        const filteredResource = filterResource(resource as unknown as Record<string, unknown>, filterOptions);

        const json = JSON.stringify(filteredResource, null, 2);
        await vscode.env.clipboard.writeText(json);
        showInfo(vscode.l10n.t('Copied {0} JSON to clipboard ({1} view)', data.name, viewMode));
      }, 'Copy as JSON');
    }),
  );

  // OPEN IN BROWSER - Open resource in F5 XC console
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.openInBrowser', async (node: ResourceNode) => {
      const data = node.getData();
      const profile = await contextManager.getContext(data.profileName);

      if (!profile) {
        showWarning(vscode.l10n.t('Context "{0}" not found', data.profileName));
        return;
      }

      // Construct console URL
      const baseUrl = profile.apiUrl.replace('/api', '');
      const consoleUrl = `${baseUrl}/web/workspaces/default/manage/load-balancers/${data.resourceType.apiPath}/${data.name}?namespace=${data.namespace}`;

      await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
    }),
  );

  // TOGGLE VIEW MODE - Switch between console and full API views
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.toggleViewMode', async () => {
      const config = vscode.workspace.getConfiguration('f5xc');
      const currentMode = config.get<ViewMode>('viewMode', 'console');
      const newMode: ViewMode = currentMode === 'console' ? 'full' : 'console';

      await config.update('viewMode', newMode, vscode.ConfigurationTarget.Global);

      const modeDescription =
        newMode === 'console'
          ? vscode.l10n.t('Console View (clean, filtered output)')
          : vscode.l10n.t('Full API View (complete response)');
      showInfo(vscode.l10n.t('Switched to {0}', modeDescription));
      logger.info(`View mode changed to: ${newMode}`);
    }),
  );
}

/**
 * Set a nested value in an object using dot-separated path.
 * Creates intermediate objects as needed.
 *
 * @param obj - The object to modify
 * @param path - Dot-separated path (e.g., 'spec.monitoring.enabled')
 * @param value - The value to set
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.length === 0) {
    return;
  }

  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string; // Safe: loop bounds ensure this is defined
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1] as string; // Safe: we checked parts.length > 0
  current[lastPart] = value;
}

/**
 * Build a spec object with server defaults and recommended values pre-populated.
 * Recommended values are included for fields that don't have server defaults,
 * providing sensible starting points for user configuration.
 *
 * @param resourceTypeKey - The resource type key
 * @param includeRecommended - Whether to include recommended values (default: true)
 * @returns Object with spec defaults and recommended values populated
 */
function buildSpecWithDefaults(resourceTypeKey: string, includeRecommended: boolean = true): Record<string, unknown> {
  const defaults = getFieldDefaults(resourceTypeKey);
  const recommended = includeRecommended ? getRecommendedValues(resourceTypeKey) : {};
  const spec: Record<string, unknown> = {};

  // First apply defaults
  for (const [path, value] of Object.entries(defaults)) {
    // Remove 'spec.' prefix if present since we're building the spec object
    const specPath = path.startsWith('spec.') ? path.slice(5) : path;
    if (specPath) {
      setNestedValue(spec, specPath, value);
    }
  }

  // Then apply recommended values for fields without defaults
  for (const [path, value] of Object.entries(recommended)) {
    const specPath = path.startsWith('spec.') ? path.slice(5) : path;
    if (specPath && !defaults[path]) {
      setNestedValue(spec, specPath, value);
    }
  }

  return spec;
}

/**
 * Create a resource template for a given type.
 *
 * Uses field metadata to pre-populate server defaults when available.
 * Falls back to hardcoded templates for complex types that need
 * more sophisticated structure (e.g., nested arrays, references).
 */
function createResourceTemplate(resourceTypeKey: string, namespace: string): object {
  const baseTemplate = {
    kind: resourceTypeKey,
    metadata: {
      name: `new-${resourceTypeKey}`,
      namespace,
      labels: {},
      annotations: {},
    },
    spec: {},
  };

  // Check if we have field metadata with server defaults or recommended values
  const serverDefaultFields = getServerDefaultFields(resourceTypeKey);
  const recommendedFields = getRecommendedValueFields(resourceTypeKey);
  const hasServerDefaults = serverDefaultFields.length > 0;
  const hasRecommendedValues = recommendedFields.length > 0;
  const hasFieldMetadata = hasServerDefaults || hasRecommendedValues;

  // Add type-specific spec templates for complex types
  // These require more sophisticated structure than just defaults
  switch (resourceTypeKey) {
    case 'http_loadbalancer':
      return {
        ...baseTemplate,
        spec: {
          domains: ['example.com'],
          http: {
            dns_volterra_managed: true,
          },
          default_route_pools: [
            {
              pool: {
                tenant: '',
                namespace,
                name: 'example-origin-pool',
              },
              weight: 1,
            },
          ],
          advertise_on_public_default_vip: {},
          // Merge in any server defaults we have
          ...(hasServerDefaults ? buildSpecWithDefaults(resourceTypeKey) : {}),
        },
      };

    case 'origin_pool':
      // Server defaults: no_tls (TLS disabled), loadbalancer_algorithm (ROUND_ROBIN),
      // endpoint_selection (DISTRIBUTED), healthcheck (empty array)
      // User must provide: origin_servers, port
      return {
        ...baseTemplate,
        spec: {
          origin_servers: [
            {
              public_ip: {
                ip: '1.2.3.4',
              },
            },
          ],
          port: 443,
          // Removed: use_tls - server applies no_tls by default
          // Removed: loadbalancer_algorithm - server applies ROUND_ROBIN by default
          // Use buildSpecWithDefaults to pull in any additional server defaults
          ...(hasFieldMetadata ? buildSpecWithDefaults(resourceTypeKey) : {}),
        },
      };

    case 'app_firewall':
      // For app_firewall, use server defaults if available, otherwise fall back to hardcoded
      if (hasServerDefaults) {
        return {
          ...baseTemplate,
          spec: {
            blocking: {},
            ...buildSpecWithDefaults(resourceTypeKey),
          },
        };
      }
      return {
        ...baseTemplate,
        spec: {
          blocking: {},
          detection_settings: {
            signature_selection_setting: {
              default_attack_type_settings: {},
            },
          },
        },
      };

    default:
      // For other types, use server defaults and recommended values if available
      if (hasFieldMetadata) {
        return {
          ...baseTemplate,
          spec: buildSpecWithDefaults(resourceTypeKey),
        };
      }
      return baseTemplate;
  }
}

/**
 * Detect resource type from filename or content
 */
function detectResourceType(_fileName: string, resource: object): string | undefined {
  const resourceAny = resource as Record<string, unknown>;
  if (typeof resourceAny.kind === 'string' && resourceAny.kind) {
    const kind = resourceAny.kind;
    if (RESOURCE_TYPES[kind]) {
      return kind;
    }
  }
  return undefined;
}
