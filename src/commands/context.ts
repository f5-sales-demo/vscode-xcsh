// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import type { XCSHContext } from '../config/contextTypes';
import { isReservedEnvKey, isValidContextName, isValidEnvKey } from '../config/contextTypes';
import type { ContextProvider, ContextTreeItem } from '../tree/contextProvider';
import type { XCSHExplorerProvider } from '../tree/xcshExplorer';
import { showInfo, showWarning, withErrorHandling } from '../utils/errors';

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
export function registerContextCommands(
  context: vscode.ExtensionContext,
  contextManager: ContextManager,
  contextProvider: ContextProvider,
  explorerProvider: XCSHExplorerProvider,
): void {
  // ADD CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.addContext', async () => {
      await withErrorHandling(async () => {
        // Step 1: Context name
        const name = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Enter a name for this context'),
          placeHolder: 'production',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return vscode.l10n.t('Context name is required');
            }
            if (!isValidContextName(value)) {
              return vscode.l10n.t(
                'Context name can only contain letters, numbers, underscores, and hyphens (1-64 chars, no reserved words)',
              );
            }
            return null;
          },
        });

        if (!name) {
          return;
        }

        // Step 2: API URL
        const apiUrl = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Enter API URL'),
          placeHolder: 'https://tenant.console.ves.volterra.io',
          value: 'https://',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value?.startsWith('https://')) {
              return vscode.l10n.t('API URL must start with https://');
            }
            try {
              new URL(value);
              return null;
            } catch {
              return vscode.l10n.t('Invalid URL format');
            }
          },
        });

        if (!apiUrl) {
          return;
        }

        // Step 3: API Token
        const apiToken = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Enter your API token'),
          password: true,
          placeHolder: vscode.l10n.t('Your API token'),
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return vscode.l10n.t('API token is required');
            }
            return null;
          },
        });

        if (!apiToken) {
          return;
        }

        // Step 4: Default namespace
        const defaultNamespace = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Enter default namespace'),
          placeHolder: 'system',
          value: 'system',
          ignoreFocusOut: true,
        });

        if (defaultNamespace === undefined) {
          return;
        }

        // Build context
        const newContext: XCSHContext = {
          name,
          apiUrl,
          apiToken,
          defaultNamespace: defaultNamespace.trim() || 'system',
        };

        // Check if workspace has .xcsh/ directory — offer local vs global choice
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const hasXcshDir = wsFolder ? fs.existsSync(path.join(wsFolder, '.xcsh')) : false;

        let createLocal = false;
        if (hasXcshDir && wsFolder) {
          const scope = await vscode.window.showQuickPick(
            [
              {
                label: vscode.l10n.t('Create for this project only'),
                description: vscode.l10n.t('Stored in .xcsh/contexts/'),
                value: 'local' as const,
              },
              {
                label: vscode.l10n.t('Create globally'),
                description: vscode.l10n.t('Stored in ~/.config/xcsh/contexts/'),
                value: 'global' as const,
              },
            ],
            { placeHolder: vscode.l10n.t('Where should this context be stored?'), ignoreFocusOut: true },
          );

          if (!scope) {
            return;
          }
          createLocal = scope.value === 'local';
        }

        // Add context to the chosen location
        if (createLocal && wsFolder) {
          await contextManager.addLocalContext(newContext, wsFolder);
        } else {
          await contextManager.addContext(newContext);
        }

        // Validate credentials
        const validating = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Validating credentials...'),
            cancellable: false,
          },
          async () => {
            return contextManager.validateContext(name);
          },
        );

        if (validating) {
          showInfo(vscode.l10n.t('Context "{0}" added and validated successfully', name));
        } else {
          showWarning(
            vscode.l10n.t('Context "{0}" added but credentials could not be validated. Check your settings.', name),
          );
        }

        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Add context');
    }),
  );

  // EDIT CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.editContext', async (node?: ContextTreeItem) => {
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
            { placeHolder: vscode.l10n.t('Select context to edit'), ignoreFocusOut: true },
          );

          if (!selected) {
            return;
          }

          contextName = selected.label;
        }

        const ctx = await contextManager.getContext(contextName);
        if (!ctx) {
          showWarning(vscode.l10n.t('Context "{0}" not found', contextName));
          return;
        }

        // Build edit options
        const editOptions: { label: string; description: string }[] = [
          { label: vscode.l10n.t('API URL'), description: vscode.l10n.t('Current: {0}', ctx.apiUrl) },
          { label: vscode.l10n.t('API Token'), description: vscode.l10n.t('Update API token') },
          {
            label: vscode.l10n.t('Default Namespace'),
            description: vscode.l10n.t('Current: {0}', ctx.defaultNamespace || vscode.l10n.t('Not set')),
          },
        ];

        const editOption = await vscode.window.showQuickPick(editOptions, {
          placeHolder: vscode.l10n.t('What would you like to edit?'),
          ignoreFocusOut: true,
        });

        if (!editOption) {
          return;
        }

        const updates: Partial<XCSHContext> = {};

        switch (editOption.label) {
          case vscode.l10n.t('API URL'): {
            const newUrl = await vscode.window.showInputBox({
              prompt: vscode.l10n.t('Enter new API URL'),
              value: ctx.apiUrl,
              ignoreFocusOut: true,
              validateInput: (value) => {
                if (!value?.startsWith('https://')) {
                  return vscode.l10n.t('API URL must start with https://');
                }
                return null;
              },
            });

            if (!newUrl) {
              return;
            }

            updates.apiUrl = newUrl;
            break;
          }

          case vscode.l10n.t('API Token'): {
            const newToken = await vscode.window.showInputBox({
              prompt: vscode.l10n.t('Enter new API token'),
              password: true,
              placeHolder: vscode.l10n.t('New API token'),
              ignoreFocusOut: true,
            });

            if (!newToken) {
              return;
            }

            updates.apiToken = newToken;
            break;
          }

          case vscode.l10n.t('Default Namespace'): {
            const newNamespace = await vscode.window.showInputBox({
              prompt: vscode.l10n.t('Enter new default namespace (leave empty to clear)'),
              value: ctx.defaultNamespace || '',
              ignoreFocusOut: true,
            });

            if (newNamespace === undefined) {
              return;
            }

            updates.defaultNamespace = newNamespace.trim() || undefined;
            break;
          }
        }

        // Apply updates
        await contextManager.updateContext(contextName, updates);

        showInfo(vscode.l10n.t('Context "{0}" updated', contextName));
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Edit context');
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

        contextProvider.refresh();
        explorerProvider.refresh();
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
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Switch namespace');
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
        contextProvider.refresh();
        explorerProvider.refresh();
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

        await contextManager.setActiveContext(contextName);
        showInfo(vscode.l10n.t('Active context set to "{0}"', contextName));
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Set active context');
    }),
  );

  // CLEAR AUTH CACHE
  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.clearAuthCache', async () => {
      await withErrorHandling(() => {
        contextManager.clearAllCachesPublic();
        showInfo(vscode.l10n.t('Authentication cache cleared. Re-authentication will occur on next request.'));
        explorerProvider.refresh();
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
        contextProvider.refresh();
        explorerProvider.refresh();
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
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Unlink local context');
    }),
  );
}
