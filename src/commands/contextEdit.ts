// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import type { XCSHContext } from '../config/contextTypes';
import { XCSH_API_TOKEN, XCSH_CONSOLE_PASSWORD, XCSH_USERNAME } from '../config/contextTypes';
import type { ContextTreeItem } from '../tree/contextProvider';
import { showInfo, showWarning } from '../utils/errors';
import {
  credentialValidationFailureMessage,
  normalizeXcshApiUrlInput,
  normalizeXcshCredentialInput,
  validateCredentialsWithProgress,
} from './contextCredentialValidation';

function setOrClearEnv(env: Record<string, string> | undefined, key: string, value: string): Record<string, string> {
  const next = { ...(env ?? {}) };
  if (value) {
    next[key] = value;
  } else {
    delete next[key];
  }
  return next;
}

export type ContextEditTarget = ContextTreeItem | string | undefined;

/** Testable edit flow. Credential changes are persisted only after namespace discovery succeeds. */
export class ContextEditController {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async run(target?: ContextEditTarget): Promise<boolean> {
    let contextName: string | undefined;
    if (typeof target === 'string') {
      contextName = target;
    } else if (target) {
      contextName = target.getContext().name;
    } else {
      const contexts = await this.contextManager.getContexts();
      if (contexts.length === 0) {
        showWarning(vscode.l10n.t('No contexts configured'));
        return false;
      }
      const selected = await vscode.window.showQuickPick(
        contexts.map((context) => ({ label: context.name, description: context.apiUrl })),
        { placeHolder: vscode.l10n.t('Select context to edit'), ignoreFocusOut: true },
      );
      contextName = selected?.label;
    }
    if (!contextName) {
      return false;
    }

    const ctx = await this.contextManager.getContext(contextName);
    if (!ctx) {
      showWarning(vscode.l10n.t('Context "{0}" not found', contextName));
      return false;
    }

    const editOptions: { label: string; description: string }[] = [
      { label: vscode.l10n.t('API URL'), description: vscode.l10n.t('Current: {0}', ctx.apiUrl) },
      { label: vscode.l10n.t('API Token'), description: vscode.l10n.t('Update API token') },
      {
        label: vscode.l10n.t('Default Namespace'),
        description: vscode.l10n.t('Current: {0}', ctx.defaultNamespace || vscode.l10n.t('Not set')),
      },
      {
        label: vscode.l10n.t('Username'),
        description: vscode.l10n.t('Current: {0}', ctx.env?.[XCSH_USERNAME] || vscode.l10n.t('Not set')),
      },
      {
        label: vscode.l10n.t('Console Password'),
        description: ctx.env?.[XCSH_CONSOLE_PASSWORD]
          ? vscode.l10n.t('Set — update web-console password')
          : vscode.l10n.t('Set web-console password'),
      },
    ];
    const editOption = await vscode.window.showQuickPick(editOptions, {
      placeHolder: vscode.l10n.t('What would you like to edit?'),
      ignoreFocusOut: true,
    });
    if (!editOption) {
      return false;
    }

    const updates: Partial<XCSHContext> = {};
    if (editOption.label === vscode.l10n.t('API URL')) {
      const rawUrl = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter new API URL'),
        value: ctx.apiUrl,
        ignoreFocusOut: true,
        validateInput: (value) => {
          const normalized = normalizeXcshApiUrlInput(value);
          return normalized?.startsWith('https://') ? null : vscode.l10n.t('API URL must use HTTPS');
        },
      });
      if (rawUrl === undefined) {
        return false;
      }
      const apiUrl = normalizeXcshApiUrlInput(rawUrl);
      if (!apiUrl?.startsWith('https://')) {
        return false;
      }
      if (!(await this.validateCredentialChange(apiUrl, ctx.apiToken))) {
        return false;
      }
      updates.apiUrl = apiUrl;
    } else if (editOption.label === vscode.l10n.t('API Token')) {
      const rawToken = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter new API token'),
        password: true,
        placeHolder: vscode.l10n.t('New API token'),
        ignoreFocusOut: true,
        validateInput: (value) =>
          normalizeXcshCredentialInput(value, XCSH_API_TOKEN)
            ? null
            : vscode.l10n.t('Enter an API token or XCSH_API_TOKEN assignment'),
      });
      if (rawToken === undefined) {
        return false;
      }
      const apiToken = normalizeXcshCredentialInput(rawToken, XCSH_API_TOKEN);
      if (!apiToken || !(await this.validateCredentialChange(ctx.apiUrl, apiToken))) {
        return false;
      }
      updates.apiToken = apiToken;
    } else if (editOption.label === vscode.l10n.t('Default Namespace')) {
      const value = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter new default namespace (leave empty to clear)'),
        value: ctx.defaultNamespace || '',
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return false;
      }
      updates.defaultNamespace = value.trim() || undefined;
    } else if (editOption.label === vscode.l10n.t('Username')) {
      const value = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter web-console login username (leave empty to clear)'),
        value: ctx.env?.[XCSH_USERNAME] ?? '',
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return false;
      }
      updates.env = setOrClearEnv(ctx.env, XCSH_USERNAME, value.trim());
    } else if (editOption.label === vscode.l10n.t('Console Password')) {
      const value = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter web-console login password (leave empty to clear)'),
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return false;
      }
      updates.env = setOrClearEnv(ctx.env, XCSH_CONSOLE_PASSWORD, value);
    } else {
      return false;
    }

    await this.contextManager.updateContext(contextName, updates);
    showInfo(vscode.l10n.t('Context "{0}" updated', contextName));
    return true;
  }

  private async validateCredentialChange(apiUrl: string, apiToken: string): Promise<boolean> {
    const validation = await validateCredentialsWithProgress(apiUrl, apiToken, this.fetchImpl);
    if (validation.status === 'connected') {
      return true;
    }
    showWarning(credentialValidationFailureMessage(validation.failureReason));
    return false;
  }
}
