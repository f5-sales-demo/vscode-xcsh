// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { isValidContextName, XCSH_API_TOKEN, XCSH_CONSOLE_PASSWORD, XCSH_USERNAME } from '../config/contextTypes';
import { buildNamespacePickChoices } from '../tree/xcshExplorer';
import { showWarning } from '../utils/errors';
import {
  credentialValidationFailureMessage,
  normalizeXcshApiUrlInput,
  normalizeXcshCredentialInput,
  validateCredentialsWithProgress,
} from './contextCredentialValidation';

/** Testable controller for the complete add-context flow. It does not write until every prompt succeeds. */
export class ContextAddController {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly workspaceFolder: string | undefined,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async run(): Promise<string | undefined> {
    const name = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Enter a name for this context'),
      placeHolder: 'production',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value?.trim()) {
          return vscode.l10n.t('Context name is required');
        }
        if (!isValidContextName(value)) {
          return vscode.l10n.t(
            'Context name can only contain letters, numbers, underscores, and hyphens (1-64 chars, no reserved words)',
          );
        }
        return this.contextManager.contextExists(value)
          ? vscode.l10n.t('Context "{0}" already exists. Choose a different name or edit the existing context.', value)
          : null;
      },
    });
    if (!name) {
      return undefined;
    }
    // Guard again because tests and some VS Code hosts can resolve input without invoking validateInput.
    if (this.contextManager.contextExists(name)) {
      showWarning(vscode.l10n.t('Context "{0}" already exists. Choose a different name or edit it.', name));
      return undefined;
    }

    let apiUrl = 'https://';
    let apiToken: string;
    let namespaceNames: string[];
    for (;;) {
      const rawUrl = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter API URL'),
        placeHolder: 'https://tenant.console.ves.volterra.io',
        value: apiUrl,
        ignoreFocusOut: true,
        validateInput: (value) => {
          const normalized = normalizeXcshApiUrlInput(value);
          if (!normalized) {
            return vscode.l10n.t('Enter a valid API URL or XCSH_API_URL assignment');
          }
          return normalized.startsWith('https://') ? null : vscode.l10n.t('API URL must use HTTPS');
        },
      });
      if (rawUrl === undefined) {
        return undefined;
      }
      const normalizedUrl = normalizeXcshApiUrlInput(rawUrl);
      if (!normalizedUrl?.startsWith('https://')) {
        continue;
      }
      apiUrl = normalizedUrl;

      const rawToken = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter your API token'),
        password: true,
        placeHolder: vscode.l10n.t('Your API token'),
        ignoreFocusOut: true,
        validateInput: (value) => {
          const normalized = normalizeXcshCredentialInput(value, XCSH_API_TOKEN);
          return normalized ? null : vscode.l10n.t('Enter an API token or XCSH_API_TOKEN assignment');
        },
      });
      if (rawToken === undefined) {
        return undefined;
      }
      const normalizedToken = normalizeXcshCredentialInput(rawToken, XCSH_API_TOKEN);
      if (!normalizedToken) {
        continue;
      }
      apiToken = normalizedToken;

      const validation = await validateCredentialsWithProgress(apiUrl, apiToken, this.fetchImpl);
      if (validation.status === 'connected') {
        namespaceNames = validation.namespaces ?? [];
        break;
      }
      showWarning(credentialValidationFailureMessage(validation.failureReason));
    }

    const customLabel = vscode.l10n.t('$(edit) Enter a custom namespace...');
    const namespacePick = await vscode.window.showQuickPick(
      buildNamespacePickChoices(namespaceNames).map((choice) =>
        choice.isCustom
          ? { label: customLabel, isCustom: true }
          : {
              label: choice.name,
              description: choice.name === 'default' ? vscode.l10n.t('always present') : undefined,
              isCustom: false,
            },
      ),
      { placeHolder: vscode.l10n.t('Select the default namespace'), ignoreFocusOut: true },
    );
    if (!namespacePick) {
      return undefined;
    }
    let defaultNamespace = namespacePick.label;
    if (namespacePick.isCustom) {
      const typed = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter default namespace'),
        value: 'default',
        ignoreFocusOut: true,
      });
      if (typed === undefined) {
        return undefined;
      }
      defaultNamespace = typed.trim() || 'default';
    }

    const rawUsername = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Enter web-console login username (optional)'),
      placeHolder: vscode.l10n.t('Leave empty to skip'),
      ignoreFocusOut: true,
    });
    if (rawUsername === undefined) {
      return undefined;
    }
    const username = normalizeXcshCredentialInput(rawUsername, XCSH_USERNAME);
    if (username === null) {
      showWarning(vscode.l10n.t('The username assignment is malformed or uses the wrong XCSH key.'));
      return undefined;
    }
    const rawPassword = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Enter web-console login password (optional)'),
      password: true,
      placeHolder: vscode.l10n.t('Leave empty to skip'),
      ignoreFocusOut: true,
    });
    if (rawPassword === undefined) {
      return undefined;
    }
    const consolePassword = normalizeXcshCredentialInput(rawPassword, XCSH_CONSOLE_PASSWORD);
    if (consolePassword === null) {
      showWarning(vscode.l10n.t('The password assignment is malformed or uses the wrong XCSH key.'));
      return undefined;
    }

    const context = { name, apiUrl, apiToken, defaultNamespace };
    const env: Record<string, string> = {};
    if (username) {
      env[XCSH_USERNAME] = username;
    }
    if (consolePassword) {
      env[XCSH_CONSOLE_PASSWORD] = consolePassword;
    }
    const complete = Object.keys(env).length
      ? { ...context, env, ...(consolePassword ? { sensitiveKeys: [XCSH_CONSOLE_PASSWORD] } : {}) }
      : context;

    const hasProjectConfig = this.workspaceFolder ? fs.existsSync(path.join(this.workspaceFolder, '.xcsh')) : false;
    if (hasProjectConfig && this.workspaceFolder) {
      const scope = await vscode.window.showQuickPick(
        [
          {
            label: vscode.l10n.t('Create globally and link to this project'),
            value: 'linked' as const,
          },
          { label: vscode.l10n.t('Create globally'), value: 'global' as const },
        ],
        { placeHolder: vscode.l10n.t('Where should this context be available?'), ignoreFocusOut: true },
      );
      if (!scope) {
        return undefined;
      }
      if (scope.value === 'linked') {
        await this.contextManager.addGlobalContextAndLink(complete, this.workspaceFolder);
      } else {
        await this.contextManager.addContext(complete);
      }
    } else {
      await this.contextManager.addContext(complete);
    }
    return name;
  }
}
