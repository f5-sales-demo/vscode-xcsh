import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { ResourceService } from '../services/resourceService';
import type { F5XCExplorerProvider, ResourceNode } from '../tree/f5xcExplorer';
import type { ResourceTypeNodeData } from '../tree/treeTypes';
import { showWarning, withErrorHandling } from '../utils/errors';
import { getLogger } from '../utils/logger';

const logger = getLogger();

type ExportFormat = 'json' | 'yaml';

function sanitizePathComponent(value: string): string {
  return value.replace(/[/\\:*?"<>|]/g, '_');
}

function buildExportFilename(name: string, kind: string, format: ExportFormat): string {
  return `${sanitizePathComponent(name)}.${sanitizePathComponent(kind)}.${format === 'json' ? 'json' : 'yaml'}`;
}

function getWorkspaceRoot(): vscode.Uri | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    showWarning(vscode.l10n.t('No workspace folder open. Open a folder first to export resources.'));
    return undefined;
  }
  return folders[0]!.uri;
}

async function exportSingleResource(
  node: ResourceNode,
  format: ExportFormat,
  resourceService: ResourceService,
): Promise<void> {
  const data = node.getData();
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const filename = buildExportFilename(data.name, data.resourceTypeKey, format);
  const fileUri = vscode.Uri.joinPath(workspaceRoot, filename);

  const existingFile = await vscode.workspace.fs.stat(fileUri).then(
    () => true,
    () => false,
  );

  if (existingFile) {
    const overwrite = await vscode.window.showWarningMessage(
      vscode.l10n.t('File "{0}" already exists. Overwrite?', filename),
      { modal: true },
      vscode.l10n.t('Overwrite'),
    );
    if (overwrite !== vscode.l10n.t('Overwrite')) {
      return;
    }
  }

  const result = await resourceService.exportResource(
    data.profileName,
    data.resourceTypeKey,
    data.name,
    data.namespace,
    format,
  );

  if ('error' in result) {
    showWarning(vscode.l10n.t('Export failed: {0}', result.error));
    return;
  }

  const encoder = new TextEncoder();
  await vscode.workspace.fs.writeFile(fileUri, encoder.encode(result.content));

  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc, { preview: false });

  logger.info(`Exported ${data.resourceTypeKey}/${data.name} as ${format} to ${filename}`);
  void vscode.window.showInformationMessage(vscode.l10n.t('Exported "{0}" to {1}', data.name, filename));
}

function isResourceNode(arg: unknown): arg is ResourceNode {
  return (
    typeof arg === 'object' && arg !== null && 'getData' in arg && typeof (arg as ResourceNode).getData === 'function'
  );
}

function isResourceTypeNode(arg: unknown): arg is { getData(): ResourceTypeNodeData } {
  if (typeof arg !== 'object' || arg === null) {
    return false;
  }
  if (!('getData' in arg) || typeof (arg as Record<string, unknown>).getData !== 'function') {
    return false;
  }
  const data = (arg as { getData(): Record<string, unknown> }).getData();
  return typeof data.resourceTypeKey === 'string' && !('name' in data);
}

async function exportAllResources(
  node: { getData(): ResourceTypeNodeData },
  format: ExportFormat,
  resourceService: ResourceService,
): Promise<void> {
  const data = node.getData();
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Exporting all {0} resources...', data.resourceType.displayName),
      cancellable: false,
    },
    async () => {
      const result = await resourceService.exportAll(data.profileName, data.resourceTypeKey, data.namespace, format);

      if ('error' in result) {
        showWarning(vscode.l10n.t('Export failed: {0}', result.error));
        return;
      }

      let exportCount = 0;
      for (const [name, content] of result.contents) {
        const filename = buildExportFilename(name, data.resourceTypeKey, format);
        const fileUri = vscode.Uri.joinPath(workspaceRoot, filename);
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(fileUri, encoder.encode(content));
        exportCount++;
      }

      if (exportCount === 0) {
        void vscode.window.showInformationMessage(
          vscode.l10n.t('No {0} resources found in namespace "{1}"', data.resourceType.displayName, data.namespace),
        );
      } else {
        void vscode.window.showInformationMessage(
          vscode.l10n.t(
            'Exported {0} {1} resources to workspace root',
            exportCount.toString(),
            data.resourceType.displayName,
          ),
        );
      }

      logger.info(`Exported ${exportCount} ${data.resourceTypeKey} resources as ${format}`);
    },
  );
}

export function registerExportCommands(
  context: vscode.ExtensionContext,
  _explorer: F5XCExplorerProvider,
  contextManager: ContextManager,
): void {
  const resourceService = new ResourceService(contextManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.exportJson', async (node: unknown) => {
      await withErrorHandling(async () => {
        if (!isResourceNode(node)) {
          showWarning(vscode.l10n.t('Select a resource in the explorer to export'));
          return;
        }
        await exportSingleResource(node, 'json', resourceService);
      }, 'Export as JSON');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.exportYaml', async (node: unknown) => {
      await withErrorHandling(async () => {
        if (!isResourceNode(node)) {
          showWarning(vscode.l10n.t('Select a resource in the explorer to export'));
          return;
        }
        await exportSingleResource(node, 'yaml', resourceService);
      }, 'Export as YAML');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.exportAllJson', async (node: unknown) => {
      await withErrorHandling(async () => {
        if (!isResourceTypeNode(node)) {
          showWarning(vscode.l10n.t('Select a resource type in the explorer to export all'));
          return;
        }
        await exportAllResources(node, 'json', resourceService);
      }, 'Export All as JSON');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.exportAllYaml', async (node: unknown) => {
      await withErrorHandling(async () => {
        if (!isResourceTypeNode(node)) {
          showWarning(vscode.l10n.t('Select a resource type in the explorer to export all'));
          return;
        }
        await exportAllResources(node, 'yaml', resourceService);
      }, 'Export All as YAML');
    }),
  );
}
