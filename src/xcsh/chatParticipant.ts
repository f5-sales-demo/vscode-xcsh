// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface, F5XCContext } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { IntegrationsResponse, ToolExecutionEnd, ToolExecutionStart } from './types';

const PARTICIPANT_ID = 'f5xc.xcsh';

interface FileContext {
  currentFile?: string;
  selection?: string;
}

/**
 * Build a prompt string enriched with F5 XC context information.
 *
 * When context is available, the prompt includes the active context name,
 * namespace, and optional file/selection info so xcsh can give
 * context-aware responses.
 */
export function buildPromptWithContext(userPrompt: string, ctx: F5XCContext | null, fileContext?: FileContext): string {
  const parts: string[] = [];

  if (ctx) {
    parts.push(`[F5 XC Context: ${ctx.name} | Namespace: ${ctx.defaultNamespace}]`);
  }

  if (fileContext?.currentFile) {
    parts.push(`Current file: ${fileContext.currentFile}`);
  }

  if (fileContext?.selection) {
    parts.push(`Selected text:\n${fileContext.selection}`);
  }

  parts.push(userPrompt);

  return parts.join('\n\n');
}

export function formatStatusResponse(integrations: IntegrationsResponse): string {
  const lines: string[] = [`**xcsh** v${integrations.version}\n`, '| Integration | Status | Action |', '|---|---|---|'];
  for (const svc of integrations.services) {
    const icon =
      svc.state === 'connected' ? '$(check)' : svc.state === 'unauthenticated' ? '$(warning)' : '$(circle-slash)';
    const action = svc.hint ?? '';
    lines.push(`| ${icon} ${svc.name} | ${svc.state} | ${action} |`);
  }
  return lines.join('\n');
}

export function formatContextResponse(ctx: F5XCContext | null): string {
  if (!ctx) {
    return 'No active F5 XC context. Use the **F5 XC: Add Context** command to configure one.';
  }
  const maskedUrl = ctx.apiUrl.replace(/\/api$/, '');
  return [
    `**Active Context:** ${ctx.name}`,
    `**Console:** ${maskedUrl}`,
    `**Namespace:** ${ctx.defaultNamespace}`,
  ].join('\n\n');
}

interface ChatFollowup {
  prompt: string;
  label: string;
}

export function buildFollowups(command: string | undefined): ChatFollowup[] {
  switch (command) {
    case 'status':
      return [
        { prompt: 'Show my active context details', label: 'View Context' },
        { prompt: 'List resources in current namespace', label: 'List Resources' },
      ];
    case 'context':
      return [
        { prompt: 'List resources in current namespace', label: 'List Resources' },
        { prompt: 'Show integration health status', label: 'Check Status' },
      ];
    case 'resources':
      return [
        { prompt: 'Show details for a specific resource', label: 'Resource Details' },
        { prompt: 'Check the health of my sites', label: 'Check Site Health' },
      ];
    default:
      return [
        { prompt: 'Show integration health status', label: 'Check Status' },
        { prompt: 'List resources in current namespace', label: 'List Resources' },
      ];
  }
}

/**
 * Register the `@xcsh` chat participant in GitHub Copilot Chat.
 *
 * Streams RPC events (message updates, tool execution) back as
 * markdown response fragments and progress indicators.
 */
export function registerChatParticipant(
  extensionContext: vscode.ExtensionContext,
  rpcBridge: XcshRpcBridge,
  contextManager: ContextManagerInterface,
): vscode.Disposable {
  const logger = getLogger();

  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> => {
    // Handle slash commands before the default path
    if (request.command === 'status') {
      try {
        const integrations = await rpcBridge.getIntegrations();
        stream.markdown(formatStatusResponse(integrations));
      } catch {
        stream.markdown('Unable to fetch integration status. Is xcsh running?');
      }
      return { metadata: { command: 'status' } };
    }

    if (request.command === 'context') {
      try {
        const activeCtx = await contextManager.getActiveContext();
        stream.markdown(formatContextResponse(activeCtx));
      } catch {
        stream.markdown('Unable to fetch context. Is xcsh running?');
      }
      return { metadata: { command: 'context' } };
    }

    if (request.command === 'resources') {
      try {
        const response = await rpcBridge.sendCommand({ type: 'list_resources' });
        if (response.success) {
          stream.markdown(typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
        } else {
          stream.markdown(`**Error:** ${response.error ?? 'Unknown error listing resources'}`);
        }
      } catch {
        stream.markdown('Unable to list resources. Is xcsh running?');
      }
      return { metadata: { command: 'resources' } };
    }

    const activeCtx = await contextManager.getActiveContext();

    // Gather file context from active editor
    const editor = vscode.window.activeTextEditor;
    const fileContext: FileContext = {};
    if (editor) {
      fileContext.currentFile = editor.document.uri.fsPath;
      const selection = editor.document.getText(editor.selection);
      if (selection) {
        fileContext.selection = selection;
      }
    }

    const enrichedPrompt = buildPromptWithContext(request.prompt, activeCtx, fileContext);

    // Set up event listeners for streaming response
    const disposables: vscode.Disposable[] = [];

    const messagePromise = new Promise<void>((resolve, reject) => {
      // Stream message updates as markdown
      disposables.push(
        rpcBridge.onMessageStream((event) => {
          stream.markdown(event.text);
        }),
      );

      // Show tool execution as progress
      disposables.push(
        rpcBridge.onEvent<ToolExecutionStart>('tool_execution_start', (event) => {
          stream.progress(`Running ${event.toolName}...`);
        }),
      );

      // Tool execution end (no-op for now, keeps listener reference)
      disposables.push(
        rpcBridge.onEvent<ToolExecutionEnd>('tool_execution_end', () => {
          // Tool completed — progress auto-clears
        }),
      );

      // Listen for stream_end to know when response is complete
      disposables.push(
        rpcBridge.onEvent('stream_end', () => {
          resolve();
        }),
      );

      // Listen for errors
      disposables.push(
        rpcBridge.onEvent('error', (event) => {
          const errorMsg = (event as Record<string, unknown>).message;
          reject(new Error(typeof errorMsg === 'string' ? errorMsg : 'xcsh error'));
        }),
      );

      // Handle cancellation
      token.onCancellationRequested(() => {
        rpcBridge.abort();
        resolve();
      });
    });

    // Send the prompt
    rpcBridge.prompt(enrichedPrompt);

    try {
      await messagePromise;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Chat participant error: ${message}`);
      stream.markdown(`\n\n**Error:** ${message}`);
    } finally {
      for (const d of disposables) {
        d.dispose();
      }
    }

    return { metadata: { command: undefined } };
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = vscode.Uri.joinPath(extensionContext.extensionUri, 'resources', 'f5-icon.svg');

  participant.followupProvider = {
    provideFollowups(result: vscode.ChatResult): vscode.ChatFollowup[] {
      const cmd = typeof result.metadata?.command === 'string' ? result.metadata.command : undefined;
      return buildFollowups(cmd);
    },
  };

  participant.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
    logger.info(`Chat feedback: ${String(feedback.kind)}`);
  });

  extensionContext.subscriptions.push(participant);

  logger.info('Registered @xcsh chat participant');

  return participant;
}
