// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

/**
 * Campaigns in Kiro 1.4.26 and 1.4.51 have not established a supported
 * primary-specialist route or a qualifying persistent default.
 * Keep extension entrypoints gated until a distinct candidate passes the campaign
 * in docs/development/native-chat-prototype-1708.md. Returning true still reserves
 * these commands and prevents fallback to the CLI chat/provider in Kiro.
 */
export function registerKiroChatCommands(context: vscode.ExtensionContext): boolean {
  const native = vscode.env.appName === 'Kiro';
  void vscode.commands.executeCommand('setContext', 'xcsh.usesNativeChat', native);
  if (!native) {
    return false;
  }

  const unavailable = (): false => {
    void vscode.window.showWarningMessage(
      vscode.l10n.t(
        'xcsh specialist chat is unavailable in this Kiro version. Contexts and resource views remain available.',
      ),
    );
    return false;
  };
  for (const command of ['xcsh.xcsh.openPanel', 'xcsh.xcsh.newSession', 'xcsh.attachToChat']) {
    context.subscriptions.push(vscode.commands.registerCommand(command, unavailable));
  }
  return true;
}
