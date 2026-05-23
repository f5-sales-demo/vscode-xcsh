// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../config/contextTypes';
import { deriveTenantFromUrl } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import { ChatPanelProvider } from './chatPanelProvider';
import { registerChatParticipant } from './chatParticipant';
import { HOST_TOOL_DEFINITIONS } from './hostTools';
import { registerLanguageModelProvider } from './languageModelProvider';
import { XcshProcessManager } from './processManager';
import { XcshRpcBridge } from './rpcBridge';
import { registerTerminalIntegration } from './terminalIntegration';

/**
 * Activate the xcsh subsystem.
 *
 * This is the single entry point called from `extension.ts`.
 * It orchestrates process management, RPC bridging, host tools,
 * and all UI integrations (chat participant, language model,
 * chat panel, terminal).
 */
export async function activateXcsh(
  extensionContext: vscode.ExtensionContext,
  contextManager: ContextManagerInterface,
): Promise<void> {
  const logger = getLogger();
  const config = vscode.workspace.getConfiguration('f5xc');

  // Check if xcsh is enabled
  if (!config.get<boolean>('xcsh.enabled', true)) {
    logger.info('xcsh integration is disabled');
    return;
  }

  logger.info('Activating xcsh integration...');

  // Create process manager and configure env from active context
  const processManager = new XcshProcessManager();
  extensionContext.subscriptions.push(processManager);

  const setEnvFromContext = async (): Promise<void> => {
    const activeCtx = await contextManager.getActiveContext();
    if (activeCtx) {
      const tenant = deriveTenantFromUrl(activeCtx.apiUrl);
      const env: Record<string, string> = {
        F5XC_API_URL: activeCtx.apiUrl,
        F5XC_API_TOKEN: activeCtx.apiToken,
        F5XC_NAMESPACE: activeCtx.defaultNamespace,
        F5XC_CONTEXT_NAME: activeCtx.name,
      };
      if (tenant) {
        env.F5XC_TENANT = tenant;
      }
      processManager.setEnvVars(env);
    }
  };

  await setEnvFromContext();

  // Start the process
  processManager.start();

  // Wait for the process to be running before setting up RPC
  const childProcess = processManager.getProcess();
  if (!childProcess?.stdin || !childProcess?.stdout) {
    logger.warn('xcsh process not available, skipping RPC setup');
    return;
  }

  // Create RPC bridge
  const rpcBridge = new XcshRpcBridge(childProcess.stdin, childProcess.stdout);
  rpcBridge.init();
  extensionContext.subscriptions.push(rpcBridge);

  // Listen for context changes and restart
  extensionContext.subscriptions.push(
    contextManager.onDidChangeContext(async () => {
      logger.info('Context changed, restarting xcsh...');
      await setEnvFromContext();
      processManager.restart();

      // Re-init RPC bridge with new process streams
      const newProcess = processManager.getProcess();
      if (newProcess?.stdin && newProcess?.stdout) {
        const newBridge = new XcshRpcBridge(newProcess.stdin, newProcess.stdout);
        newBridge.init();
      }
    }),
  );

  // Register host tools via RPC
  try {
    await rpcBridge.sendCommand({
      type: 'set_host_tools',
      tools: HOST_TOOL_DEFINITIONS,
    });
    logger.info(`Registered ${String(HOST_TOOL_DEFINITIONS.length)} host tools with xcsh`);
  } catch (err) {
    logger.warn(
      'Failed to register host tools (xcsh may not support set_host_tools yet)',
      err instanceof Error ? err : new Error(String(err)),
    );
  }

  // Conditionally register Chat Participant
  if (config.get<boolean>('xcsh.chatParticipantEnabled', true)) {
    try {
      registerChatParticipant(extensionContext, rpcBridge, contextManager);
    } catch (err) {
      logger.warn(
        'Failed to register chat participant (API may not be available)',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Conditionally register Language Model Provider
  if (config.get<boolean>('xcsh.languageModelEnabled', true)) {
    try {
      registerLanguageModelProvider(extensionContext, rpcBridge);
    } catch (err) {
      logger.warn(
        'Failed to register language model provider (API may not be available)',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Conditionally register Chat Panel
  if (config.get<boolean>('xcsh.showChatPanel', true)) {
    const chatPanelProvider = new ChatPanelProvider(extensionContext.extensionUri, rpcBridge);
    extensionContext.subscriptions.push(
      vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, chatPanelProvider),
    );

    extensionContext.subscriptions.push(
      vscode.commands.registerCommand('f5xc.xcsh.openChatPanel', () => {
        void vscode.commands.executeCommand('f5xc.xcshChat.focus');
      }),
    );
  }

  // Register terminal integration
  registerTerminalIntegration(extensionContext, contextManager);

  // Register restart command
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('f5xc.xcsh.restart', async () => {
      await setEnvFromContext();
      processManager.restart();
      void vscode.window.showInformationMessage('xcsh restarted');
      logger.info('xcsh restarted via command');
    }),
  );

  // Auto-start if configured
  if (config.get<boolean>('xcsh.autoStart', true)) {
    // Process already started above; this is a no-op confirmation
    logger.info('xcsh auto-start enabled, process is running');
  }

  logger.info('xcsh integration activated');
}
