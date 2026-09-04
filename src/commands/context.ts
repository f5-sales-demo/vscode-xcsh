// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { isReservedEnvKey, isValidContextName, isValidEnvKey } from '../config/contextTypes';
import type { ContextTreeItem } from '../tree/contextProvider';
import { buildSelectableNamespaces } from '../tree/xcshExplorer';
import { showInfo, showWarning, withErrorHandling } from '../utils/errors';
import { ContextActivationController } from './contextActivation';
import { ContextAddController } from './contextAddWizard';
import { ContextEditController, type ContextEditTarget } from './contextEdit';

/**
 * Resolve the target context name: use the tree node if invoked from the view,
 * otherwise prompt with a quick pick. Returns undefined if the user cancels or
 * no contexts exist.
 */
async function selectContextName(
  contextManager: ContextManager,
  node: ContextTreeItem | undefined,
  placeHolder: string,
): Promise<string | undefined> {
  if (node) {
    return node.getContext().name;
  }
  const contexts = await contextManager.getContexts();
  if (contexts.length === 0) {
    showWarning(vscode.l10n.t('No contexts configured'));
    return undefined;
  }
  const selected = await vscode.window.showQuickPick(
    contexts.map((c) => ({ label: c.name, description: c.apiUrl })),
    { placeHolder, ignoreFocusOut: true },
  );
  return selected?.label;
}

/**
 * Register context management commands
 */
export function registerContextCommands(context: vscode.ExtensionContext, contextManager: ContextManager): void {
  // ADD CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.addContext', async () => {
      await withErrorHandling(async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const name = await new ContextAddController(contextManager, workspaceFolder).run();
        if (!name) {
          return;
        }

        showInfo(vscode.l10n.t('Context "{0}" added and verified', name));
      }, 'Add context');
    }),
  );

  // EDIT CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.editContext', async (target?: ContextEditTarget) => {
      await withErrorHandling(() => new ContextEditController(contextManager).run(target), 'Edit context');
    }),
  );

  // MANAGE CONTEXT ENV VARS
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.manageContextEnv', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        const contextName = await selectContextName(
          contextManager,
          node,
          vscode.l10n.t('Select context to manage env vars'),
        );
        if (!contextName) {
          return;
        }

        const ctx = await contextManager.getContext(contextName);
        if (!ctx) {
          showWarning(vscode.l10n.t('Context "{0}" not found', contextName));
          return;
        }

        const envKeys = Object.keys(ctx.env ?? {}).sort();
        const setLabel = vscode.l10n.t('$(add) Add or update a variable');
        const removeLabel = vscode.l10n.t('$(trash) Remove a variable');

        const action = await vscode.window.showQuickPick(
          envKeys.length > 0 ? [{ label: setLabel }, { label: removeLabel }] : [{ label: setLabel }],
          {
            placeHolder:
              envKeys.length > 0
                ? vscode.l10n.t('{0} variable(s) set: {1}', envKeys.length, envKeys.join(', '))
                : vscode.l10n.t('No environment variables set'),
            ignoreFocusOut: true,
          },
        );
        if (!action) {
          return;
        }

        if (action.label === setLabel) {
          const rawKey = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Environment variable name'),
            ignoreFocusOut: true,
            validateInput: (value) => {
              const v = value.trim();
              if (!v) {
                return vscode.l10n.t('Name is required');
              }
              if (!isValidEnvKey(v)) {
                return vscode.l10n.t('Use letters, digits and underscore; must not start with a digit');
              }
              if (isReservedEnvKey(v)) {
                return vscode.l10n.t('"{0}" is reserved and cannot be set on a context', v);
              }
              return null;
            },
          });
          if (!rawKey) {
            return;
          }
          const key = rawKey.trim();
          const value = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Value for {0}', key),
            value: ctx.env?.[key] ?? '',
            ignoreFocusOut: true,
          });
          if (value === undefined) {
            return;
          }
          await contextManager.setContextEnv(contextName, key, value);
          showInfo(vscode.l10n.t('Set {0} on context "{1}"', key, contextName));
        } else {
          const key = await vscode.window.showQuickPick(envKeys, {
            placeHolder: vscode.l10n.t('Select a variable to remove'),
            ignoreFocusOut: true,
          });
          if (!key) {
            return;
          }
          await contextManager.unsetContextEnv(contextName, key);
          showInfo(vscode.l10n.t('Removed {0} from context "{1}"', key, contextName));
        }
      }, 'Manage context env vars');
    }),
  );

  // SWITCH NAMESPACE
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.switchNamespace', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        const contextName = await selectContextName(
          contextManager,
          node,
          vscode.l10n.t('Select context to switch namespace'),
        );
        if (!contextName) {
          return;
        }

        const ctx = await contextManager.getContext(contextName);
        if (!ctx) {
          showWarning(vscode.l10n.t('Context "{0}" not found', contextName));
          return;
        }

        const namespace = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Default namespace for context "{0}"', contextName),
          value: ctx.defaultNamespace || '',
          ignoreFocusOut: true,
          validateInput: (value) => (value.trim() ? null : vscode.l10n.t('Namespace must not be empty')),
        });
        if (namespace === undefined) {
          return;
        }

        await contextManager.setContextNamespace(contextName, namespace);
        showInfo(vscode.l10n.t('Namespace for "{0}" set to {1}', contextName, namespace.trim()));
      }, 'Switch namespace');
    }),
  );

  // SELECT ACTIVE NAMESPACE (Resources view) — pick from a live list of tenant
  // namespaces (default + custom, excluding system/shared) and activate it.
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.selectActiveNamespace', async () => {
      await withErrorHandling(async () => {
        const activeContext = await contextManager.getActiveContext();
        if (!activeContext) {
          showWarning(vscode.l10n.t('No active context'));
          return;
        }

        const client = await contextManager.getClient(activeContext.name);
        const namespaces = await client.listNamespaces();
        const selectable = buildSelectableNamespaces(namespaces.map((ns) => ns.name));
        if (selectable.length === 0) {
          showWarning(vscode.l10n.t('No selectable namespaces available'));
          return;
        }

        const current = activeContext.defaultNamespace || 'default';
        const picked = await vscode.window.showQuickPick(
          selectable.map((name) => ({
            label: name,
            description: name === current ? vscode.l10n.t('active') : undefined,
          })),
          { placeHolder: vscode.l10n.t('Select active namespace'), ignoreFocusOut: true },
        );
        if (!picked || picked.label === current) {
          return;
        }

        await contextManager.setContextNamespace(activeContext.name, picked.label);
        showInfo(vscode.l10n.t('Active namespace set to {0}', picked.label));
      }, 'Select active namespace');
    }),
  );

  // RENAME CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.renameContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        const oldName = await selectContextName(contextManager, node, vscode.l10n.t('Select context to rename'));
        if (!oldName) {
          return;
        }

        const newName = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('New name for context "{0}"', oldName),
          value: oldName,
          ignoreFocusOut: true,
          validateInput: (value) => {
            const v = value.trim();
            if (!v) {
              return vscode.l10n.t('Name is required');
            }
            if (!isValidContextName(v)) {
              return vscode.l10n.t('Use 1-64 letters, digits, hyphen or underscore; not a reserved word');
            }
            return null;
          },
        });
        if (!newName || newName.trim() === oldName) {
          return;
        }

        await contextManager.renameContext(oldName, newName.trim());
        showInfo(vscode.l10n.t('Renamed context "{0}" to "{1}"', oldName, newName.trim()));
      }, 'Rename context');
    }),
  );

  // VALIDATE CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.validateContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        const contextName = await selectContextName(contextManager, node, vscode.l10n.t('Select context to validate'));
        if (!contextName) {
          return;
        }

        const valid = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Validating "{0}"…', contextName) },
          () => contextManager.validateContext(contextName),
        );

        if (valid) {
          showInfo(vscode.l10n.t('Context "{0}" is valid — the API token authenticated', contextName));
        } else {
          showWarning(vscode.l10n.t('Context "{0}" failed validation — the API token was rejected', contextName));
        }
      }, 'Validate context');
    }),
  );

  // DELETE CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.deleteContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        let contextName: string | undefined;

        if (node) {
          contextName = node.getContext().name;
        } else {
          // Prompt user to select context
          const contexts = await contextManager.getContexts();
          if (contexts.length === 0) {
            showWarning(vscode.l10n.t('No contexts configured'));
            return;
          }

          const selected = await vscode.window.showQuickPick(
            contexts.map((c) => ({
              label: c.name,
              description: c.apiUrl,
            })),
            { placeHolder: vscode.l10n.t('Select context to delete'), ignoreFocusOut: true },
          );

          if (!selected) {
            return;
          }

          contextName = selected.label;
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
          vscode.l10n.t('Delete context "{0}"? This cannot be undone.', contextName),
          { modal: true },
          vscode.l10n.t('Delete'),
        );

        if (confirm !== vscode.l10n.t('Delete')) {
          return;
        }

        await contextManager.deleteContext(contextName);
        showInfo(vscode.l10n.t('Context "{0}" deleted', contextName));
      }, 'Delete context');
    }),
  );

  // SET ACTIVE CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.setActiveContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        let contextName: string | undefined;

        if (node) {
          contextName = node.getContext().name;
        } else {
          // Prompt user to select context
          const contexts = await contextManager.getContexts();
          const activeName = await contextManager.getActiveContextName();

          if (contexts.length === 0) {
            showWarning(vscode.l10n.t('No contexts configured'));
            return;
          }

          const selected = await vscode.window.showQuickPick(
            contexts.map((c) => ({
              label: c.name,
              description: c.name === activeName ? vscode.l10n.t('(active)') : '',
              detail: c.apiUrl,
            })),
            { placeHolder: vscode.l10n.t('Select context to activate'), ignoreFocusOut: true },
          );

          if (!selected) {
            return;
          }

          contextName = selected.label;
        }

        if (await new ContextActivationController(contextManager).run(contextName)) {
          showInfo(vscode.l10n.t('Active context set to "{0}"', contextName));
        }
      }, 'Set active context');
    }),
  );

  // CLEAR AUTH CACHE
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.clearAuthCache', async () => {
      await withErrorHandling(() => {
        contextManager.clearAllCachesPublic();
        showInfo(vscode.l10n.t('Authentication cache cleared. Re-authentication will occur on next request.'));
        return Promise.resolve();
      }, 'Clear auth cache');
    }),
  );

  // LINK GLOBAL CONTEXT (create a local pointer to a global context)
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.linkGlobalContext', async () => {
      await withErrorHandling(async () => {
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsFolder) {
          showWarning(vscode.l10n.t('No workspace folder open'));
          return;
        }

        const contexts = await contextManager.getContexts();
        if (contexts.length === 0) {
          showWarning(vscode.l10n.t('No global contexts configured'));
          return;
        }

        const selected = await vscode.window.showQuickPick(
          contexts.map((c) => ({
            label: c.name,
            description: c.apiUrl,
          })),
          { placeHolder: vscode.l10n.t('Select a global context to link to this project'), ignoreFocusOut: true },
        );

        if (!selected) {
          return;
        }

        await contextManager.linkGlobalContext(selected.label, wsFolder);
        showInfo(vscode.l10n.t('Global context "{0}" linked to this project', selected.label));
      }, 'Link global context');
    }),
  );

  // UNLINK LOCAL CONTEXT (delete a local context from the workspace)
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.unlinkLocalContext', async () => {
      await withErrorHandling(async () => {
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsFolder) {
          showWarning(vscode.l10n.t('No workspace folder open'));
          return;
        }

        const localContexts = await contextManager.getLocalContexts(wsFolder);
        if (localContexts.length === 0) {
          showWarning(vscode.l10n.t('No local contexts in this project'));
          return;
        }

        const selected = await vscode.window.showQuickPick(
          localContexts.map((c) => ({
            label: c.name,
            description: c.apiUrl,
          })),
          { placeHolder: vscode.l10n.t('Select a local context to remove'), ignoreFocusOut: true },
        );

        if (!selected) {
          return;
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
          vscode.l10n.t('Remove local context "{0}" from this project? This cannot be undone.', selected.label),
          { modal: true },
          vscode.l10n.t('Remove'),
        );

        if (confirm !== vscode.l10n.t('Remove')) {
          return;
        }

        await contextManager.deleteLocalContext(selected.label, wsFolder);
        showInfo(vscode.l10n.t('Local context "{0}" removed', selected.label));
      }, 'Unlink local context');
    }),
  );
}
