// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import type { F5XCContext } from '../config/contextTypes';
import { isValidContextName } from '../config/contextTypes';
import type { ContextProvider, ContextTreeItem } from '../tree/contextProvider';
import type { F5XCExplorerProvider } from '../tree/f5xcExplorer';
import { showInfo, showWarning, withErrorHandling } from '../utils/errors';

/**
 * Register context management commands
 */
export function registerContextCommands(
  context: vscode.ExtensionContext,
  contextManager: ContextManager,
  contextProvider: ContextProvider,
  explorerProvider: F5XCExplorerProvider,
): void {
  // ADD CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.addContext', async () => {
      await withErrorHandling(async () => {
        // Step 1: Context name
        const name = await vscode.window.showInputBox({
          prompt: 'Enter a name for this context',
          placeHolder: 'production',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Context name is required';
            }
            if (!isValidContextName(value)) {
              return 'Context name can only contain letters, numbers, underscores, and hyphens (1-64 chars, no reserved words)';
            }
            return null;
          },
        });

        if (!name) {
          return;
        }

        // Step 2: API URL
        const apiUrl = await vscode.window.showInputBox({
          prompt: 'Enter F5 XC API URL',
          placeHolder: 'https://tenant.console.ves.volterra.io',
          value: 'https://',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value?.startsWith('https://')) {
              return 'API URL must start with https://';
            }
            try {
              new URL(value);
              return null;
            } catch {
              return 'Invalid URL format';
            }
          },
        });

        if (!apiUrl) {
          return;
        }

        // Step 3: API Token
        const apiToken = await vscode.window.showInputBox({
          prompt: 'Enter your API token',
          password: true,
          placeHolder: 'Your API token',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'API token is required';
            }
            return null;
          },
        });

        if (!apiToken) {
          return;
        }

        // Step 4: Default namespace
        const defaultNamespace = await vscode.window.showInputBox({
          prompt: 'Enter default namespace',
          placeHolder: 'system',
          value: 'system',
          ignoreFocusOut: true,
        });

        if (defaultNamespace === undefined) {
          return;
        }

        // Build context
        const newContext: F5XCContext = {
          name,
          apiUrl,
          apiToken,
          defaultNamespace: defaultNamespace.trim() || 'system',
        };

        // Add context
        await contextManager.addContext(newContext);

        // Validate credentials
        const validating = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Validating credentials...',
            cancellable: false,
          },
          async () => {
            return contextManager.validateContext(name);
          },
        );

        if (validating) {
          showInfo(`Context "${name}" added and validated successfully`);
        } else {
          showWarning(`Context "${name}" added but credentials could not be validated. Check your settings.`);
        }

        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Add context');
    }),
  );

  // EDIT CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.editContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        let contextName: string | undefined;

        if (node) {
          contextName = node.getContext().name;
        } else {
          // Prompt user to select context
          const contexts = await contextManager.getContexts();
          if (contexts.length === 0) {
            showWarning('No contexts configured');
            return;
          }

          const selected = await vscode.window.showQuickPick(
            contexts.map((c) => ({
              label: c.name,
              description: c.apiUrl,
            })),
            { placeHolder: 'Select context to edit', ignoreFocusOut: true },
          );

          if (!selected) {
            return;
          }

          contextName = selected.label;
        }

        const ctx = await contextManager.getContext(contextName);
        if (!ctx) {
          showWarning(`Context "${contextName}" not found`);
          return;
        }

        // Build edit options
        const editOptions: { label: string; description: string }[] = [
          { label: 'API URL', description: `Current: ${ctx.apiUrl}` },
          { label: 'API Token', description: 'Update API token' },
          {
            label: 'Default Namespace',
            description: `Current: ${ctx.defaultNamespace || 'Not set'}`,
          },
        ];

        const editOption = await vscode.window.showQuickPick(editOptions, {
          placeHolder: 'What would you like to edit?',
          ignoreFocusOut: true,
        });

        if (!editOption) {
          return;
        }

        const updates: Partial<F5XCContext> = {};

        switch (editOption.label) {
          case 'API URL': {
            const newUrl = await vscode.window.showInputBox({
              prompt: 'Enter new API URL',
              value: ctx.apiUrl,
              ignoreFocusOut: true,
              validateInput: (value) => {
                if (!value?.startsWith('https://')) {
                  return 'API URL must start with https://';
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

          case 'API Token': {
            const newToken = await vscode.window.showInputBox({
              prompt: 'Enter new API token',
              password: true,
              placeHolder: 'New API token',
              ignoreFocusOut: true,
            });

            if (!newToken) {
              return;
            }

            updates.apiToken = newToken;
            break;
          }

          case 'Default Namespace': {
            const newNamespace = await vscode.window.showInputBox({
              prompt: 'Enter new default namespace (leave empty to clear)',
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

        showInfo(`Context "${contextName}" updated`);
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Edit context');
    }),
  );

  // DELETE CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.deleteContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        let contextName: string | undefined;

        if (node) {
          contextName = node.getContext().name;
        } else {
          // Prompt user to select context
          const contexts = await contextManager.getContexts();
          if (contexts.length === 0) {
            showWarning('No contexts configured');
            return;
          }

          const selected = await vscode.window.showQuickPick(
            contexts.map((c) => ({
              label: c.name,
              description: c.apiUrl,
            })),
            { placeHolder: 'Select context to delete', ignoreFocusOut: true },
          );

          if (!selected) {
            return;
          }

          contextName = selected.label;
        }

        // Confirm deletion
        const confirm = await vscode.window.showWarningMessage(
          `Delete context "${contextName}"? This cannot be undone.`,
          { modal: true },
          'Delete',
        );

        if (confirm !== 'Delete') {
          return;
        }

        await contextManager.deleteContext(contextName);
        showInfo(`Context "${contextName}" deleted`);
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Delete context');
    }),
  );

  // SET ACTIVE CONTEXT
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.setActiveContext', async (node?: ContextTreeItem) => {
      await withErrorHandling(async () => {
        let contextName: string | undefined;

        if (node) {
          contextName = node.getContext().name;
        } else {
          // Prompt user to select context
          const contexts = await contextManager.getContexts();
          const activeName = await contextManager.getActiveContextName();

          if (contexts.length === 0) {
            showWarning('No contexts configured');
            return;
          }

          const selected = await vscode.window.showQuickPick(
            contexts.map((c) => ({
              label: c.name,
              description: c.name === activeName ? '(active)' : '',
              detail: c.apiUrl,
            })),
            { placeHolder: 'Select context to activate', ignoreFocusOut: true },
          );

          if (!selected) {
            return;
          }

          contextName = selected.label;
        }

        await contextManager.setActiveContext(contextName);
        showInfo(`Active context set to "${contextName}"`);
        contextProvider.refresh();
        explorerProvider.refresh();
      }, 'Set active context');
    }),
  );

  // CLEAR AUTH CACHE
  context.subscriptions.push(
    vscode.commands.registerCommand('f5xc.clearAuthCache', async () => {
      await withErrorHandling(() => {
        contextManager.clearAllCachesPublic();
        showInfo('Authentication cache cleared. Re-authentication will occur on next request.');
        explorerProvider.refresh();
        return Promise.resolve();
      }, 'Clear auth cache');
    }),
  );
}
