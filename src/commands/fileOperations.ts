import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { ResourceService } from '../services/resourceService';
import type { F5XCExplorerProvider } from '../tree/f5xcExplorer';
import { showWarning, withErrorHandling } from '../utils/errors';
import { getLogger } from '../utils/logger';
import { getManifestKind, isXCManifest } from '../utils/manifestDetector';

const logger = getLogger();

function getResourceName(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return (parsed.metadata as Record<string, unknown>)?.name as string | undefined;
  } catch {
    const match = /^name:\s*(.+)$/m.exec(content);
    return match?.[1]?.trim();
  }
}

function formatFieldName(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1] ?? path;
}

function formatChangedFields(diff: { changed: unknown[]; added: unknown[]; removed: unknown[] }): string {
  const lines: string[] = [];

  for (const d of diff.changed) {
    const p = (d as { path: string }).path;
    lines.push(`${formatFieldName(p)} (changed)`);
  }
  for (const d of diff.added) {
    const p = (d as { path: string }).path;
    lines.push(`${formatFieldName(p)} (added)`);
  }
  for (const d of diff.removed) {
    const p = (d as { path: string }).path;
    lines.push(`${formatFieldName(p)} (removed)`);
  }

  if (lines.length === 0) {
    return '';
  }
  if (lines.length <= 4) {
    return lines.join('  ');
  }
  return `${lines.slice(0, 3).join('  ')}  +${lines.length - 3} more`;
}

async function getDocumentContent(arg: unknown): Promise<{ content: string; uri: vscode.Uri } | undefined> {
  if (arg instanceof vscode.Uri) {
    const doc = await vscode.workspace.openTextDocument(arg);
    return { content: doc.getText(), uri: arg };
  }

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    return { content: editor.document.getText(), uri: editor.document.uri };
  }

  showWarning(vscode.l10n.t('No file selected. Open or select a manifest file first.'));
  return undefined;
}

function validateManifestContent(content: string): boolean {
  if (!isXCManifest(content)) {
    showWarning(
      vscode.l10n.t(
        'This file is not a valid XC manifest. A manifest requires a "kind" field matching a known resource type and "metadata.name".',
      ),
    );
    return false;
  }
  return true;
}

function detectFormat(uri: vscode.Uri): 'json' | 'yaml' {
  const path = uri.fsPath.toLowerCase();
  if (path.endsWith('.yaml') || path.endsWith('.yml')) {
    return 'yaml';
  }
  return 'json';
}

async function getActiveContextName(contextManager: ContextManager): Promise<string | undefined> {
  const activeContext = await contextManager.getActiveContext();
  if (!activeContext) {
    showWarning(vscode.l10n.t('No active context. Configure and activate a context first.'));
    return undefined;
  }
  return activeContext.name;
}

export function registerFileOperationCommands(
  context: vscode.ExtensionContext,
  explorer: F5XCExplorerProvider,
  contextManager: ContextManager,
): void {
  const resourceService = new ResourceService(contextManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.fileApply', async (arg: unknown) => {
      await withErrorHandling(async () => {
        const doc = await getDocumentContent(arg);
        if (!doc) {
          return;
        }
        if (!validateManifestContent(doc.content)) {
          return;
        }

        const contextName = await getActiveContextName(contextManager);
        if (!contextName) {
          return;
        }

        const kind = getManifestKind(doc.content);
        const confirm = await vscode.window.showInformationMessage(
          vscode.l10n.t('Apply {0} manifest from "{1}"?', kind ?? 'resource', vscode.workspace.asRelativePath(doc.uri)),
          { modal: true },
          vscode.l10n.t('Apply'),
        );
        if (confirm !== vscode.l10n.t('Apply')) {
          return;
        }

        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Applying manifest...'),
          },
          () => resourceService.applyManifest(contextName, doc.content),
        );

        if (result.status === 'error') {
          showWarning(vscode.l10n.t('Apply failed: {0}', result.error?.message ?? 'Unknown error'));
          return;
        }

        const resourceName = getResourceName(doc.content) ?? kind ?? 'resource';
        if (result.status === 'created') {
          void vscode.window.showInformationMessage(vscode.l10n.t('{0} created', resourceName));
        } else if (result.status === 'updated') {
          const fields = result.diff ? formatChangedFields(result.diff) : '';
          const msg = fields
            ? vscode.l10n.t('{0} updated: {1}', resourceName, fields)
            : vscode.l10n.t('{0} updated', resourceName);
          void vscode.window.showInformationMessage(msg);
        } else if (result.status === 'unchanged') {
          void vscode.window.showInformationMessage(vscode.l10n.t('{0} unchanged', resourceName));
        }

        explorer.refresh();
        logger.info(`Applied manifest from ${vscode.workspace.asRelativePath(doc.uri)}: ${result.status}`);
      }, 'Apply manifest');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.fileCreate', async (arg: unknown) => {
      await withErrorHandling(async () => {
        const doc = await getDocumentContent(arg);
        if (!doc) {
          return;
        }
        if (!validateManifestContent(doc.content)) {
          return;
        }

        const contextName = await getActiveContextName(contextManager);
        if (!contextName) {
          return;
        }

        const kind = getManifestKind(doc.content);
        const confirm = await vscode.window.showInformationMessage(
          vscode.l10n.t(
            'Create {0} resource from "{1}"?',
            kind ?? 'resource',
            vscode.workspace.asRelativePath(doc.uri),
          ),
          { modal: true },
          vscode.l10n.t('Create'),
        );
        if (confirm !== vscode.l10n.t('Create')) {
          return;
        }

        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Creating resource...'),
          },
          () => resourceService.createManifest(contextName, doc.content),
        );

        if (result.status === 'error') {
          if (result.error?.message?.includes('ALREADY_EXISTS') || result.error?.httpStatus === 409) {
            showWarning(vscode.l10n.t('Resource already exists. Use "XC: Apply" to update an existing resource.'));
          } else {
            showWarning(vscode.l10n.t('Create failed: {0}', result.error?.message ?? 'Unknown error'));
          }
          return;
        }

        const resourceName = getResourceName(doc.content) ?? kind ?? 'resource';
        void vscode.window.showInformationMessage(vscode.l10n.t('{0} created', resourceName));
        explorer.refresh();
        logger.info(`Created ${resourceName} from ${vscode.workspace.asRelativePath(doc.uri)}`);
      }, 'Create resource');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.fileDiff', async (arg: unknown) => {
      await withErrorHandling(async () => {
        const doc = await getDocumentContent(arg);
        if (!doc) {
          return;
        }
        if (!validateManifestContent(doc.content)) {
          return;
        }

        const contextName = await getActiveContextName(contextManager);
        if (!contextName) {
          return;
        }

        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Comparing with remote...'),
          },
          () => resourceService.diffManifest(contextName, doc.content, undefined, detectFormat(doc.uri)),
        );

        if (result.error) {
          showWarning(vscode.l10n.t('Diff failed: {0}', result.error));
          return;
        }

        const resourceName = getResourceName(doc.content) ?? getManifestKind(doc.content) ?? 'resource';

        if (result.isNew) {
          void vscode.window.showInformationMessage(
            vscode.l10n.t('"{0}" not found remotely — use XC: Create to deploy it.', resourceName),
          );
          return;
        }

        if (result.remoteContent) {
          const remoteUri = vscode.Uri.parse(`untitled:Remote (${resourceName})`);
          const remoteDoc = await vscode.workspace.openTextDocument(remoteUri);
          const edit = new vscode.WorkspaceEdit();
          edit.insert(remoteUri, new vscode.Position(0, 0), result.remoteContent);
          await vscode.workspace.applyEdit(edit);

          await vscode.commands.executeCommand(
            'vscode.diff',
            remoteDoc.uri,
            doc.uri,
            vscode.l10n.t('Remote ↔ Local: {0}', resourceName),
          );
        } else if (result.diff) {
          if (!result.diff.hasDifferences) {
            void vscode.window.showInformationMessage(vscode.l10n.t('"{0}" matches remote', resourceName));
          } else {
            const summary = resourceService.formatDiff(result.diff);
            void vscode.window.showInformationMessage(vscode.l10n.t('"{0}" differs: {1}', resourceName, summary));
          }
        }

        logger.info(`Diff completed for ${vscode.workspace.asRelativePath(doc.uri)}`);
      }, 'Diff manifest');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.fileDelete', async (arg: unknown) => {
      await withErrorHandling(async () => {
        const doc = await getDocumentContent(arg);
        if (!doc) {
          return;
        }
        if (!validateManifestContent(doc.content)) {
          return;
        }

        const contextName = await getActiveContextName(contextManager);
        if (!contextName) {
          return;
        }

        const kind = getManifestKind(doc.content);
        const resourceName = getResourceName(doc.content) ?? kind ?? 'resource';
        const confirm = await vscode.window.showWarningMessage(
          vscode.l10n.t('Delete "{0}" from F5 XC? This cannot be undone.', resourceName),
          { modal: true },
          vscode.l10n.t('Delete'),
        );
        if (confirm !== vscode.l10n.t('Delete')) {
          return;
        }

        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Deleting {0}...', resourceName),
          },
          () => resourceService.deleteFromManifest(contextName, doc.content),
        );

        if (result.status === 'error') {
          showWarning(vscode.l10n.t('Delete failed: {0}', result.error?.message ?? 'Unknown error'));
          return;
        }

        void vscode.window.showInformationMessage(vscode.l10n.t('"{0}" deleted', resourceName));
        explorer.refresh();
        logger.info(`Deleted ${resourceName} from manifest ${vscode.workspace.asRelativePath(doc.uri)}`);
      }, 'Delete resource');
    }),
  );
}
