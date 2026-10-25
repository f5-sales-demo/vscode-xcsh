// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';

const NATIVE_CHAT_COMMAND = 'kiroAgent.focusChatInput';

/** Kiro owns authentication and model choice; no credentials cross this boundary. */
export function registerKiroChatCommands(context: vscode.ExtensionContext): boolean {
  const native = vscode.env.appName === 'Kiro';
  void vscode.commands.executeCommand('setContext', 'xcsh.usesNativeChat', native);
  if (!native) {
    return false;
  }

  const focus = async (options: { newSession?: boolean; prompt?: string; submit?: boolean } = {}): Promise<void> => {
    try {
      const commands = await vscode.commands.getCommands(true);
      if (!commands.includes(NATIVE_CHAT_COMMAND)) {
        void vscode.window.showWarningMessage(
          vscode.l10n.t('Kiro chat is unavailable. Try reopening the Kiro window.'),
        );
        return;
      }
      await vscode.commands.executeCommand(NATIVE_CHAT_COMMAND, { ensureSession: true, ...options });
    } catch {
      getLogger().warn('integration.activation.failed');
      void vscode.window.showWarningMessage(vscode.l10n.t('Kiro chat is unavailable. Try reopening the Kiro window.'));
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('xcsh.xcsh.openPanel', () => focus()),
    vscode.commands.registerCommand('xcsh.xcsh.newSession', () => focus({ newSession: true })),
    vscode.commands.registerCommand('xcsh.attachToChat', async (arg?: { name?: string; content?: string }) => {
      if (typeof arg?.name !== 'string' || typeof arg.content !== 'string') {
        return;
      }
      await focus({ prompt: `Resource: ${arg.name}\n\n\`\`\`json\n${arg.content}\n\`\`\``, submit: false });
    }),
  );
  return true;
}
