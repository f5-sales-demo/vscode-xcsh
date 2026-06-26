// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface, XCSHContext } from '../config/contextTypes';
import { deriveTenantFromUrl, isInjectableContextEnvKey } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import { findXcshBinary } from './processManager';

const BREW_INSTALL_CMD = 'brew install f5-sales-demo/tap/xcsh';

async function showXcshNotFoundPrompt(): Promise<void> {
  const action = await vscode.window.showErrorMessage(
    vscode.l10n.t('xcsh binary not found. Install via Homebrew: `{0}`', BREW_INSTALL_CMD),
    vscode.l10n.t('Copy Install Command'),
    vscode.l10n.t('Open Settings'),
  );

  if (action === vscode.l10n.t('Copy Install Command')) {
    await vscode.env.clipboard.writeText(BREW_INSTALL_CMD);
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Install command copied to clipboard. Paste it in your terminal.'),
    );
  } else if (action === vscode.l10n.t('Open Settings')) {
    void vscode.commands.executeCommand('workbench.action.openSettings', 'xcsh.xcsh.path');
  }
}

/**
 * Build environment variables from an F5 XC context for use in
 * terminal sessions. Derives tenant from the API URL hostname.
 */
export function buildTerminalEnv(ctx: XCSHContext): Record<string, string | undefined> {
  const tenant = deriveTenantFromUrl(ctx.apiUrl);
  const env: Record<string, string | undefined> = {
    XCSH_API_URL: ctx.apiUrl,
    XCSH_API_TOKEN: ctx.apiToken,
    XCSH_NAMESPACE: ctx.defaultNamespace,
    XCSH_CONTEXT_NAME: ctx.name,
  };

  if (tenant) {
    env.XCSH_TENANT = tenant;
  }

  // Inject the context's generic env map. Allowlist: only XCSH_-namespaced,
  // non-reserved keys reach the terminal — a project-local context is untrusted
  // input, so anything outside the XCSH_ namespace (LD_PRELOAD, NODE_OPTIONS,
  // PATH, …) is refused and can never run code.
  if (ctx.env) {
    for (const [key, value] of Object.entries(ctx.env)) {
      if (isInjectableContextEnvKey(key)) {
        env[key] = value;
      }
    }
  }

  return env;
}

/**
 * Register a terminal profile provider for xcsh and the
 * `xcsh.openTerminal` command.
 *
 * The terminal profile appears in the terminal dropdown and spawns
 * an xcsh interactive session pre-configured with the active
 * F5 XC context environment variables.
 */
export function registerTerminalIntegration(
  extensionContext: vscode.ExtensionContext,
  contextManager: ContextManagerInterface,
): void {
  const logger = getLogger();

  // Register terminal profile provider
  const profileProvider: vscode.TerminalProfileProvider = {
    async provideTerminalProfile(_token: vscode.CancellationToken): Promise<vscode.TerminalProfile | undefined> {
      const userPath = vscode.workspace.getConfiguration('xcsh').get<string>('xcsh.path');
      const binary = findXcshBinary(userPath);

      if (!binary) {
        void showXcshNotFoundPrompt();
        return undefined;
      }

      const activeCtx = await contextManager.getActiveContext();
      const env: Record<string, string> = {};

      if (activeCtx) {
        const ctxEnv = buildTerminalEnv(activeCtx);
        for (const [key, value] of Object.entries(ctxEnv)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
      }

      return new vscode.TerminalProfile({
        name: 'xcsh',
        shellPath: binary,
        env,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
        iconPath: new vscode.ThemeIcon('terminal'),
      });
    },
  };

  extensionContext.subscriptions.push(
    vscode.window.registerTerminalProfileProvider('xcsh.xcsh.terminal', profileProvider),
  );

  // Register the openTerminal command
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('xcsh.xcsh.openTerminal', async () => {
      const userPath = vscode.workspace.getConfiguration('xcsh').get<string>('xcsh.path');
      const binary = findXcshBinary(userPath);

      if (!binary) {
        void showXcshNotFoundPrompt();
        return;
      }

      const activeCtx = await contextManager.getActiveContext();
      const env: Record<string, string> = {};

      if (activeCtx) {
        const ctxEnv = buildTerminalEnv(activeCtx);
        for (const [key, value] of Object.entries(ctxEnv)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
      }

      const terminal = vscode.window.createTerminal({
        name: 'xcsh',
        shellPath: binary,
        env,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri,
        iconPath: new vscode.ThemeIcon('terminal'),
      });

      terminal.show();
      logger.info('Opened xcsh terminal');
    }),
  );

  logger.info('Registered xcsh terminal integration');
}
