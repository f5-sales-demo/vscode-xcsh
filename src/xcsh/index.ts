// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../config/contextTypes';
import { deriveTenantFromUrl } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import { registerChatParticipant } from './chatParticipant';
import { HOST_TOOL_DEFINITIONS, handleHostToolCall } from './hostTools';
import { registerLanguageModelProvider } from './languageModelProvider';
import { registerLanguageModelTools } from './languageModelTools';
import { XcshPanelProvider } from './panelProvider';
import { XcshProcessManager } from './processManager';
import { XcshRpcBridge } from './rpcBridge';
import { registerTerminalIntegration } from './terminalIntegration';
import type { RpcCommand, RpcHostToolCall } from './types';

function registerHostToolsOnBridge(bridge: XcshRpcBridge): void {
  const logger = getLogger();

  bridge
    .sendCommand({
      type: 'set_host_tools',
      tools: HOST_TOOL_DEFINITIONS,
    })
    .then(() => {
      logger.info(`Registered ${String(HOST_TOOL_DEFINITIONS.length)} host tools with xcsh`);
    })
    .catch((err: unknown) => {
      logger.warn(
        'Failed to register host tools (xcsh may not support set_host_tools yet)',
        err instanceof Error ? err : new Error(String(err)),
      );
    });

  bridge.onEvent('host_tool_call', (event) => {
    const call = event as unknown as RpcHostToolCall;
    void handleHostToolCall(call).then((result) => {
      bridge.sendCommand(result as unknown as RpcCommand).catch((err: unknown) => {
        logger.error('Failed to send host tool result', err instanceof Error ? err : new Error(String(err)));
      });
    });
  });
}

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

  // Auto-configure Agents Window support
  if (config.get<boolean>('xcsh.agentsWindowPrompt', true)) {
    const inspected = vscode.workspace
      .getConfiguration('extensions')
      .inspect<Record<string, boolean>>('supportAgentsWindow');
    const current = inspected?.globalValue ?? {};
    if (!current['f5xc-salesdemos.xcsh']) {
      const updated = { ...current, 'f5xc-salesdemos.xcsh': true };
      void vscode.workspace
        .getConfiguration('extensions')
        .update('supportAgentsWindow', updated, vscode.ConfigurationTarget.Global);
      logger.info('Auto-enabled xcsh in Agents Window');
    }
  }

  // Install xcsh custom agent to user profile for global availability
  const agentSource = path.join(extensionContext.extensionPath, 'agents', 'xcsh.agent.md');
  const copilotAgentsDir = path.join(process.env.HOME ?? '', '.copilot', 'agents');
  const agentDest = path.join(copilotAgentsDir, 'xcsh.agent.md');
  try {
    if (fs.existsSync(agentSource)) {
      const sourceContent = fs.readFileSync(agentSource, 'utf8');
      const destExists = fs.existsSync(agentDest);
      const needsUpdate = !destExists || fs.readFileSync(agentDest, 'utf8') !== sourceContent;
      if (needsUpdate) {
        fs.mkdirSync(copilotAgentsDir, { recursive: true });
        fs.writeFileSync(agentDest, sourceContent, 'utf8');
        logger.info(
          destExists ? 'Updated xcsh agent in ~/.copilot/agents/' : 'Installed xcsh agent to ~/.copilot/agents/',
        );
      }
    }
  } catch (err) {
    logger.debug('Could not install xcsh agent to user profile', err instanceof Error ? err : new Error(String(err)));
  }

  // Detect secondary sidebar support (VS Code >= 1.106)
  const versionParts = vscode.version.split('.').map(Number);
  const major = versionParts[0] ?? 0;
  const minor = versionParts[1] ?? 0;
  const supportsSecondarySidebar = major > 1 || (major === 1 && minor >= 106);
  if (!supportsSecondarySidebar) {
    void vscode.commands.executeCommand('setContext', 'f5xc:doesNotSupportSecondarySidebar', true);
  }

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

      const newProcess = processManager.getProcess();
      if (newProcess?.stdin && newProcess?.stdout) {
        rpcBridge.reconnect(newProcess.stdin, newProcess.stdout);
        registerHostToolsOnBridge(rpcBridge);
      }
    }),
  );

  // Register host tools and handler
  registerHostToolsOnBridge(rpcBridge);

  // Register Language Model Tools for agent mode
  registerLanguageModelTools(extensionContext);

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

  // Register the xcsh panel (activity bar fallback + secondary sidebar)
  const panelProvider = new XcshPanelProvider(extensionContext.extensionUri, rpcBridge);
  extensionContext.subscriptions.push(
    vscode.window.registerWebviewViewProvider(XcshPanelProvider.viewType, panelProvider),
  );
  extensionContext.subscriptions.push(
    vscode.window.registerWebviewViewProvider(XcshPanelProvider.viewTypeSecondary, panelProvider),
  );

  const focusPanelCommand = supportsSecondarySidebar ? 'f5xc.xcshPanelSecondary.focus' : 'f5xc.xcshPanel.focus';

  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('f5xc.xcsh.openPanel', () => {
      const panelMode = vscode.workspace.getConfiguration('f5xc').get<string>('xcsh.panelMode', 'webview');
      if (panelMode === 'terminal') {
        void vscode.commands.executeCommand('f5xc.xcsh.openTerminal');
      } else {
        void vscode.commands.executeCommand(focusPanelCommand);
      }
    }),
  );

  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('f5xc.xcsh.newSession', () => {
      void vscode.commands.executeCommand(focusPanelCommand);
    }),
  );

  // Register terminal integration
  registerTerminalIntegration(extensionContext, contextManager);

  // Register restart command
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('f5xc.xcsh.restart', async () => {
      await setEnvFromContext();
      processManager.restart();

      const newProcess = processManager.getProcess();
      if (newProcess?.stdin && newProcess?.stdout) {
        rpcBridge.reconnect(newProcess.stdin, newProcess.stdout);
        registerHostToolsOnBridge(rpcBridge);
      }

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
