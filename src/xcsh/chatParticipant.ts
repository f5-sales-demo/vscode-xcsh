// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface, XCSHContext } from '../config/contextTypes';
import { AUTH_ENV_KEYS, isSensitiveEnvKey, maskToken } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { IntegrationsResponse, ToolExecutionEnd, ToolExecutionStart } from './types';

const PARTICIPANT_ID = 'xcsh.xcsh';

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
export function buildPromptWithContext(userPrompt: string, ctx: XCSHContext | null, fileContext?: FileContext): string {
  const parts: string[] = [];

  if (ctx) {
    parts.push(`[xcsh Context: ${ctx.name} | Namespace: ${ctx.defaultNamespace}]`);
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
  const lines: string[] = [`**xcsh** v${integrations.version}\n`];

  const modelIcon = integrations.model.state === 'connected' ? '✅' : '⚠️';
  lines.push(`**${vscode.l10n.t('Model Provider')}**`);
  lines.push(`${modelIcon} ${integrations.model.provider ?? vscode.l10n.t('unknown')}\n`);

  lines.push(`---\n`);

  for (const svc of integrations.services) {
    if (svc.state === 'connected') {
      lines.push(`✅ ${svc.name}`);
    } else if (svc.state === 'unauthenticated') {
      lines.push(`⚠️ ${svc.name} — ${vscode.l10n.t('needs authentication')}${svc.hint ? ` · \`${svc.hint}\`` : ''}`);
    } else {
      lines.push(`⭘ ${svc.name} — ${vscode.l10n.t('not installed')}`);
    }
  }

  return lines.join('\n');
}

export function formatContextResponse(ctx: XCSHContext | null): string {
  if (!ctx) {
    return vscode.l10n.t('No active xcsh context. Use the **xcsh: Add Context** command to configure one.');
  }
  const maskedUrl = ctx.apiUrl.replace(/\/api$/, '');
  const lines = [
    `**${vscode.l10n.t('Active Context')}:** ${ctx.name}`,
    `**${vscode.l10n.t('Console')}:** ${maskedUrl}`,
    `**${vscode.l10n.t('Namespace')}:** ${ctx.defaultNamespace}`,
  ];
  // Auth section: recognized web-console credentials, console password masked.
  const env = ctx.env;
  if (env) {
    for (const key of AUTH_ENV_KEYS) {
      const value = env[key];
      if (value) {
        lines.push(`**${key}:** ${isSensitiveEnvKey(key) ? maskToken(value) : value}`);
      }
    }
  }
  return lines.join('\n\n');
}

interface ChatFollowup {
  prompt: string;
  label: string;
}

export function buildFollowups(command: string | undefined): ChatFollowup[] {
  switch (command) {
    case 'status':
      return [
        { prompt: vscode.l10n.t('Show active context details'), label: vscode.l10n.t('View Context') },
        { prompt: vscode.l10n.t('List resources in current namespace'), label: vscode.l10n.t('List Resources') },
      ];
    case 'context':
      return [
        { prompt: vscode.l10n.t('List resources in current namespace'), label: vscode.l10n.t('List Resources') },
        { prompt: vscode.l10n.t('Show integration health status'), label: vscode.l10n.t('Check Status') },
      ];
    case 'resources':
      return [
        { prompt: vscode.l10n.t('Show details for a specific resource'), label: vscode.l10n.t('Resource Details') },
        { prompt: vscode.l10n.t('Check the health of my sites'), label: vscode.l10n.t('Check Site Health') },
      ];
    default:
      return [
        { prompt: vscode.l10n.t('Show integration health status'), label: vscode.l10n.t('Check Status') },
        { prompt: vscode.l10n.t('List resources in current namespace'), label: vscode.l10n.t('List Resources') },
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

  const FOLLOWUP_PATTERNS: Array<{ pattern: RegExp; command: string }> = [
    { pattern: /context\s*details/i, command: 'context' },
    { pattern: /integration.*(?:health|status)/i, command: 'status' },
    { pattern: /list\s*resources/i, command: 'resources' },
  ];

  const runSlashCommand = async (command: string, stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> => {
    if (command === 'status') {
      try {
        const integrations = await rpcBridge.getIntegrations();
        stream.markdown(formatStatusResponse(integrations));
      } catch {
        stream.markdown(vscode.l10n.t('Unable to fetch integration status. Is xcsh running?'));
      }
      return { metadata: { command: 'status' } };
    }

    if (command === 'context') {
      try {
        const activeCtx = await contextManager.getActiveContext();
        stream.markdown(formatContextResponse(activeCtx));
      } catch {
        stream.markdown(vscode.l10n.t('Unable to fetch context. Is xcsh running?'));
      }
      return { metadata: { command: 'context' } };
    }

    // resources
    try {
      const activeCtx = await contextManager.getActiveContext();
      if (!activeCtx) {
        stream.markdown(
          vscode.l10n.t('No active xcsh context. Use the **xcsh: Add Context** command to configure one.'),
        );
      } else {
        const maskedUrl = activeCtx.apiUrl.replace(/\/api$/, '');
        stream.markdown(
          [
            `**${vscode.l10n.t('Resources for')}:** ${activeCtx.name}`,
            `**${vscode.l10n.t('Console')}:** ${maskedUrl}`,
            `**${vscode.l10n.t('Namespace')}:** ${activeCtx.defaultNamespace}`,
            '',
            vscode.l10n.t(
              'Browse resources in the **xcsh** sidebar (Explorer tree view) for full resource listing, viewing, and editing.',
            ),
          ].join('\n\n'),
        );
      }
    } catch {
      stream.markdown('Unable to fetch context. Is xcsh running?');
    }
    return { metadata: { command: 'resources' } };
  };

  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> => {
    if (request.command) {
      const prompt = request.prompt.trim();
      logger.info(`Chat handler: command=${request.command}, prompt="${prompt}"`);
      if (prompt) {
        const matched = FOLLOWUP_PATTERNS.find((fp) => fp.pattern.test(prompt));
        logger.info(`Chat handler: matched=${matched ? matched.command : 'none'}`);
        if (matched) {
          return runSlashCommand(matched.command, stream);
        }
      }
      return runSlashCommand(request.command, stream);
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
    logger.info(`Chat participant: sending prompt (${enrichedPrompt.length} chars)`);

    const disposables: vscode.Disposable[] = [];
    let receivedAnyEvent = false;
    let textChunkCount = 0;
    let resolveReason = 'unknown';
    const STREAM_TIMEOUT_MS = 120_000;

    const messagePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolveReason = 'timeout';
        logger.warn(
          `Chat participant stream timed out after ${String(STREAM_TIMEOUT_MS)}ms (receivedAnyEvent=${String(receivedAnyEvent)}, textChunks=${String(textChunkCount)})`,
        );
        resolve();
      }, STREAM_TIMEOUT_MS);

      disposables.push(new vscode.Disposable(() => clearTimeout(timeout)));

      disposables.push(
        rpcBridge.onMessageStream((event) => {
          receivedAnyEvent = true;
          textChunkCount++;
          if (textChunkCount <= 3) {
            logger.info(`Chat participant: text chunk #${String(textChunkCount)} (${event.text.length} chars)`);
          }
          stream.markdown(event.text);
        }),
      );

      disposables.push(
        rpcBridge.onEvent<ToolExecutionStart>('tool_execution_start', (event) => {
          receivedAnyEvent = true;
          logger.info(`Chat participant: tool_execution_start ${event.toolName}`);
          stream.progress(`Running ${event.toolName}...`);
        }),
      );

      disposables.push(
        rpcBridge.onEvent<ToolExecutionEnd>('tool_execution_end', (event) => {
          receivedAnyEvent = true;
          logger.info(`Chat participant: tool_execution_end ${event.toolCallId}`);
        }),
      );

      disposables.push(
        rpcBridge.onEvent('turn_end', () => {
          receivedAnyEvent = true;
          resolveReason = 'turn_end';
          logger.info(`Chat participant: turn_end (textChunks=${String(textChunkCount)})`);
          clearTimeout(timeout);
          resolve();
        }),
      );

      disposables.push(
        rpcBridge.onEvent('result', () => {
          receivedAnyEvent = true;
          resolveReason = 'result';
          logger.info(`Chat participant: result event (textChunks=${String(textChunkCount)})`);
          clearTimeout(timeout);
          resolve();
        }),
      );

      disposables.push(
        rpcBridge.onEvent('error', (event) => {
          receivedAnyEvent = true;
          resolveReason = 'error';
          clearTimeout(timeout);
          const errorMsg = (event as Record<string, unknown>).message;
          logger.error(`Chat participant: error event: ${String(errorMsg)}`);
          reject(new Error(typeof errorMsg === 'string' ? errorMsg : 'xcsh error'));
        }),
      );

      token.onCancellationRequested(() => {
        resolveReason = 'cancelled';
        rpcBridge.abort();
        clearTimeout(timeout);
        resolve();
      });
    });

    rpcBridge.prompt(enrichedPrompt, { locale: vscode.env.language });

    try {
      await messagePromise;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Chat participant error: ${message}`);
      stream.markdown(`\n\n**Error:** ${message}`);
    } finally {
      logger.info(
        `Chat participant: done (reason=${resolveReason}, events=${String(receivedAnyEvent)}, textChunks=${String(textChunkCount)})`,
      );
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
