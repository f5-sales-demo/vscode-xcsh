// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { checkGitTracking } from '../config/contextResolver';
import type { ContextManagerInterface } from '../config/contextTypes';
import { CURRENT_SCHEMA_VERSION, deriveTenantFromUrl, isInjectableContextEnvKey } from '../config/contextTypes';
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
      logger.info('integration.activation.completed');
    })
    .catch(() => {
      logger.warn('integration.activation.failed');
    });

  bridge.onEvent('host_tool_call', (event) => {
    const call = event as unknown as RpcHostToolCall;
    void handleHostToolCall(call).then((result) => {
      bridge.sendCommand(result as unknown as RpcCommand).catch(() => {
        logger.error('host-tool.failed');
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
    logger.info('integration.activation.disabled');
    return;
  }

  logger.info('integration.activation.started');

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
    const resolved = await contextManager.resolveContext(getWorkspaceCwd());
    if (!resolved) {
      return;
    }

    // Session gate (parity with the TUI and the views): do NOT auto-load a
    // persisted context (local/global pointer files) into the embedded shell until
    // the user has explicitly activated one this session. The env tier
    // (XCSH_API_URL/XCSH_API_TOKEN) is an explicit user choice and is always honored.
    if (resolved.source !== 'env' && !contextManager.isSessionActivated()) {
      logger.info('integration.context.unavailable');
      return;
    }

    const ctx = resolved.context;

    // Schema-version gate: refuse a context written by a newer schema this build
    // can't safely interpret (mirrors the shell's compatible-version check).
    if (typeof ctx.version === 'number' && ctx.version > CURRENT_SCHEMA_VERSION) {
      logger.warn('integration.context.unavailable');
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
    // Inject the context's generic env map (auth credentials like XCSH_USERNAME /
    // XCSH_CONSOLE_PASSWORD, plus other XCSH_ demo vars). Allowlist: only
    // XCSH_-namespaced, non-reserved keys reach the subprocess — a project-local
    // context is untrusted input, so anything outside the XCSH_ namespace
    // (LD_PRELOAD, NODE_OPTIONS, PATH, …) is refused. Mirrors the shell's
    // #applyToSettings.
    if (ctx.env) {
      for (const [key, value] of Object.entries(ctx.env)) {
        if (isInjectableContextEnvKey(key)) {
          env[key] = value;
        }
      }
    }
    processManager.setEnvVars(env);

    // Git-tracking safety: a project-local context file under .xcsh/contexts/
    // may hold an API token; warn if it is tracked by git (matches the shell).
    if (resolved.source === 'local') {
      checkGitTracking(resolved.sourcePath)
        .then((tracked) => {
          if (tracked) {
            logger.warn('integration.context.unavailable');
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
    logger.warn('integration.process.unavailable');
    return;
  }

  // Create RPC bridge
  const rpcBridge = new XcshRpcBridge(childProcess.stdin, childProcess.stdout);
  rpcBridge.init();
  extensionContext.subscriptions.push(rpcBridge);

  // Listen for context changes and restart
  extensionContext.subscriptions.push(
    contextManager.onDidChangeContext(async () => {
      logger.info('context.changed');
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
      logger.info('context.changed');
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
    logger.warn('integration.locale.failed');
  });

  // Register Language Model Tools for agent mode
  registerLanguageModelTools(extensionContext);

  // Conditionally register Chat Participant
  if (config.get<boolean>('xcsh.chatParticipantEnabled', true)) {
    try {
      registerChatParticipant(extensionContext, rpcBridge, contextManager);
    } catch {
      logger.warn('integration.activation.failed');
    }
  }

  // Conditionally register Language Model Provider
  if (config.get<boolean>('xcsh.languageModelEnabled', true)) {
    try {
      registerLanguageModelProvider(extensionContext, rpcBridge);
    } catch {
      logger.warn('integration.activation.failed');
    }
  }

  // Register the xcsh panel (activity bar fallback + secondary sidebar)
  const panelProvider = new XcshPanelProvider(extensionContext.extensionUri, rpcBridge, contextManager);
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

  // Inject a resource JSON payload into the chat input as a context attachment.
  // Invoked by the resource webview button and the tree "Add to xcsh chat"
  // command; both pass { name, content }. Always focus the webview panel — a
  // context chip needs the webview even when panelMode is 'terminal'.
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand('xcsh.attachToChat', async (arg?: { name?: string; content?: string }) => {
      if (typeof arg?.name !== 'string' || typeof arg?.content !== 'string') {
        logger.warn('webview.attachment.failed');
        return;
      }
      await vscode.commands.executeCommand(focusPanelCommand);
      panelProvider.attachContext(arg.name, arg.content);
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
      logger.info('integration.activation.completed');
    }),
  );

  // Auto-start if configured
  if (config.get<boolean>('xcsh.autoStart', true)) {
    // Process already started above; this is a no-op confirmation
    logger.info('integration.activation.completed');
  }

  logger.info('integration.activation.completed');
}
