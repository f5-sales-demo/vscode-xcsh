// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { checkGitTracking, resolveContext } from '../config/contextResolver';
import type { ContextManagerInterface } from '../config/contextTypes';
import { CURRENT_SCHEMA_VERSION, deriveTenantFromUrl } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import { registerChatParticipant } from './chatParticipant';
import { HOST_TOOL_DEFINITIONS, handleHostToolCall } from './hostTools';
import { registerLanguageModelProvider } from './languageModelProvider';
import { registerLanguageModelTools } from './languageModelTools';
import { XcshPanelProvider } from './panelProvider';
import { XcshProcessManager } from './processManager';
import { XcshRpcBridge } from './rpcBridge';
import { createXcshStatusBar } from './statusBar';
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
  const config = vscode.workspace.getConfiguration('xcsh');

  // Check if xcsh is enabled
  if (!config.get<boolean>('xcsh.enabled', true)) {
    logger.info('xcsh integration is disabled');
    return;
  }

  logger.info('Activating xcsh integration...');

  // Detect secondary sidebar support (VS Code >= 1.106)
  const versionParts = vscode.version.split('.').map(Number);
  const major = versionParts[0] ?? 0;
  const minor = versionParts[1] ?? 0;
  const supportsSecondarySidebar = major > 1 || (major === 1 && minor >= 106);
  if (!supportsSecondarySidebar) {
    void vscode.commands.executeCommand('setContext', 'xcsh:doesNotSupportSecondarySidebar', true);
  }

  const getWorkspaceCwd = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Create process manager and configure env from active context
  const processManager = new XcshProcessManager();
  extensionContext.subscriptions.push(processManager);

  const setEnvFromContext = async (): Promise<void> => {
    // Use three-tier context resolution (env > local > global)
    const resolved = await resolveContext(getWorkspaceCwd());
    if (!resolved) {
      return;
    }
    const ctx = resolved.context;

    // Schema-version gate: refuse a context written by a newer schema this build
    // can't safely interpret (mirrors the shell's compatible-version check).
    if (typeof ctx.version === 'number' && ctx.version > CURRENT_SCHEMA_VERSION) {
      logger.warn(
        `Context "${ctx.name}" uses schema version ${String(ctx.version)}, newer than supported ` +
          `(${String(CURRENT_SCHEMA_VERSION)}); not applying it. Update the extension.`,
      );
      return;
    }

    const tenant = deriveTenantFromUrl(ctx.apiUrl);
    const env: Record<string, string> = {
      XCSH_API_URL: ctx.apiUrl,
      XCSH_API_TOKEN: ctx.apiToken,
      XCSH_NAMESPACE: ctx.defaultNamespace,
      XCSH_CONTEXT_NAME: ctx.name,
    };
    if (tenant) {
      env.XCSH_TENANT = tenant;
    }
    processManager.setEnvVars(env);

    // Git-tracking safety: a project-local context file under .xcsh/contexts/
    // may hold an API token; warn if it is tracked by git (matches the shell).
    if (resolved.source === 'local') {
      checkGitTracking(resolved.sourcePath)
        .then((tracked) => {
          if (tracked) {
            logger.warn(
              `${resolved.sourcePath} is tracked by git and may contain credentials. ` +
                `Run: git rm --cached "${resolved.sourcePath}"`,
            );
          }
        })
        .catch(() => {
          /* best-effort safety check */
        });
    }
  };

  await setEnvFromContext();
  processManager.setCwd(getWorkspaceCwd());

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
      processManager.setCwd(getWorkspaceCwd());
      processManager.restart();

      const newProcess = processManager.getProcess();
      if (newProcess?.stdin && newProcess?.stdout) {
        rpcBridge.reconnect(newProcess.stdin, newProcess.stdout);
        registerHostToolsOnBridge(rpcBridge);
        rpcBridge.setLocale(vscode.env.language).catch(() => {});
      }
    }),
  );

  extensionContext.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      logger.info('Workspace folders changed, restarting xcsh...');
      processManager.setCwd(getWorkspaceCwd());
      processManager.restart();

      const newProcess = processManager.getProcess();
      if (newProcess?.stdin && newProcess?.stdout) {
        rpcBridge.reconnect(newProcess.stdin, newProcess.stdout);
        registerHostToolsOnBridge(rpcBridge);
        rpcBridge.setLocale(vscode.env.language).catch(() => {});
      }
    }),
  );

  // Register host tools and handler
  registerHostToolsOnBridge(rpcBridge);

  // Set locale so xcsh responds in the user's display language
  rpcBridge.setLocale(vscode.env.language).catch(() => {
    logger.warn('Failed to set locale on xcsh');
  });

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

  const focusPanelCommand = supportsSecondarySidebar ? 'xcsh.xcshPanelSecondary.focus' : 'xcsh.xcshPanel.focus';

  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('xcsh.xcsh.openPanel', () => {
      const panelMode = vscode.workspace.getConfiguration('xcsh').get<string>('xcsh.panelMode', 'webview');
      if (panelMode === 'terminal') {
        void vscode.commands.executeCommand('xcsh.xcsh.openTerminal');
      } else {
        void vscode.commands.executeCommand(focusPanelCommand);
      }
    }),
  );

  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('xcsh.xcsh.newSession', () => {
      void vscode.commands.executeCommand(focusPanelCommand);
    }),
  );

  // Register terminal integration
  registerTerminalIntegration(extensionContext, contextManager);
  createXcshStatusBar(extensionContext.subscriptions);

  // Register restart command
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('xcsh.xcsh.restart', async () => {
      await setEnvFromContext();
      processManager.setCwd(getWorkspaceCwd());
      processManager.restart();

      const newProcess = processManager.getProcess();
      if (newProcess?.stdin && newProcess?.stdout) {
        rpcBridge.reconnect(newProcess.stdin, newProcess.stdout);
        registerHostToolsOnBridge(rpcBridge);
        rpcBridge.setLocale(vscode.env.language).catch(() => {});
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
