// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface, F5XCContext } from '../config/contextTypes';
import { deriveTenantFromUrl } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import { findXcshBinary } from './processManager';

/**
 * Build environment variables from an F5 XC context for use in
 * terminal sessions. Derives tenant from the API URL hostname.
 */
export function buildTerminalEnv(ctx: F5XCContext): Record<string, string | undefined> {
  const tenant = deriveTenantFromUrl(ctx.apiUrl);
  const env: Record<string, string | undefined> = {
    F5XC_API_URL: ctx.apiUrl,
    F5XC_API_TOKEN: ctx.apiToken,
    F5XC_NAMESPACE: ctx.defaultNamespace,
    F5XC_CONTEXT_NAME: ctx.name,
  };

  if (tenant) {
    env.F5XC_TENANT = tenant;
  }

  return env;
}

/**
 * Register a terminal profile provider for xcsh and the
 * `f5xc.xcsh.openTerminal` command.
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
      const userPath = vscode.workspace.getConfiguration('f5xc').get<string>('xcsh.path');
      const binary = findXcshBinary(userPath);

      if (!binary) {
        void vscode.window.showErrorMessage('xcsh binary not found. Install xcsh or configure the path in settings.');
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
        iconPath: new vscode.ThemeIcon('terminal'),
      });
    },
  };

  extensionContext.subscriptions.push(
    vscode.window.registerTerminalProfileProvider('f5xc.xcsh.terminal', profileProvider),
  );

  // Register the openTerminal command
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('f5xc.xcsh.openTerminal', async () => {
      const userPath = vscode.workspace.getConfiguration('f5xc').get<string>('xcsh.path');
      const binary = findXcshBinary(userPath);

      if (!binary) {
        void vscode.window.showErrorMessage('xcsh binary not found. Install xcsh or configure the path in settings.');
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
        iconPath: new vscode.ThemeIcon('terminal'),
      });

      terminal.show();
      logger.info('Opened xcsh terminal');
    }),
  );

  logger.info('Registered xcsh terminal integration');
}
