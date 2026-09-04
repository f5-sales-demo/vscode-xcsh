// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManager } from '../config/contextManager';
import { credentialValidationFailureMessage, validateCredentialsWithProgress } from './contextCredentialValidation';

/** Activates a context only after its credentials can enumerate namespaces. */
export class ContextActivationController {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async run(contextName: string): Promise<boolean> {
    const candidate = await this.contextManager.getContext(contextName);
    if (!candidate) {
      void vscode.window.showWarningMessage(vscode.l10n.t('Context "{0}" not found', contextName));
      return false;
    }

    for (;;) {
      const validation = await validateCredentialsWithProgress(
        candidate.apiUrl,
        candidate.apiToken,
        this.fetchImpl,
        vscode.l10n.t('Validating context "{0}"...', contextName),
      );
      if (validation.status === 'connected') {
        await this.contextManager.setActiveContext(contextName);
        return true;
      }

      const edit = vscode.l10n.t('Edit Context');
      const retry = vscode.l10n.t('Retry');
      const action = await vscode.window.showErrorMessage(
        credentialValidationFailureMessage(validation.failureReason),
        ...(validation.failureReason === 'unauthorized' ? [edit, retry] : [retry, edit]),
      );
      if (action === retry) {
        continue;
      }
      if (action === edit) {
        await vscode.commands.executeCommand('xcsh.editContext', contextName);
      }
      return false;
    }
  }
}
