// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface, XCSHContext } from '../config/contextTypes';
import { AUTH_ENV_KEYS } from '../config/contextTypes';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { IntegrationsResponse, ToolExecutionEnd, ToolExecutionStart } from './types';

// Must exactly match `contributes.chatParticipants[].id` in package.json — VS Code
// binds this runtime handler to the static declaration (its @name, slash commands,
// and disambiguation) by id. A mismatch means the participant fails to register /
// loses its declared commands. `xcshChatParticipant.test.ts` guards this.
export const PARTICIPANT_ID = 'xcsh.chat';

interface FileContext {
  currentFile?: string;
  selection?: string;
}

/**
 * Build the local engine prompt with only the user-selected editor context.
 * Context identity and absolute workstation paths are intentionally omitted.
 */
export function buildPromptWithContext(userPrompt: string, fileContext?: FileContext): string {
  const parts: string[] = [];

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
  const lines = [
    `**${vscode.l10n.t('Active Context')}:** ${vscode.l10n.t('Configured')}`,
    `**${vscode.l10n.t('API credentials')}:** ${vscode.l10n.t('Configured')}`,
    `**${vscode.l10n.t('Namespace name')}:** ${vscode.l10n.t('Configured')}`,
  ];
  if (AUTH_ENV_KEYS.some((key) => Boolean(ctx.env?.[key]))) {
    lines.push(`**${vscode.l10n.t('Web-console credentials')}:** ${vscode.l10n.t('Configured')}`);
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
        stream.markdown(
          [
            `**${vscode.l10n.t('Resources')}:** ${vscode.l10n.t('Active context configured')}`,
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
      logger.info('chat.request.started');
      if (prompt) {
        const matched = FOLLOWUP_PATTERNS.find((fp) => fp.pattern.test(prompt));
        if (matched) {
          return runSlashCommand(matched.command, stream);
        }
      }
      return runSlashCommand(request.command, stream);
    }

    // Gather file context from active editor
    const editor = vscode.window.activeTextEditor;
    const fileContext: FileContext = {};
    if (editor) {
      fileContext.currentFile = vscode.workspace.asRelativePath(editor.document.uri, false);
      const selection = editor.document.getText(editor.selection);
      if (selection) {
        fileContext.selection = selection;
      }
    }

    const enrichedPrompt = buildPromptWithContext(request.prompt, fileContext);
    logger.info('chat.request.started');

    const disposables: vscode.Disposable[] = [];
    const STREAM_TIMEOUT_MS = 120_000;

    const messagePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn('chat.request.timed-out');
        resolve();
      }, STREAM_TIMEOUT_MS);

      disposables.push(new vscode.Disposable(() => clearTimeout(timeout)));

      disposables.push(
        rpcBridge.onMessageStream((event) => {
          logger.info('chat.event.received');
          stream.markdown(event.text);
        }),
      );

      disposables.push(
        rpcBridge.onEvent<ToolExecutionStart>('tool_execution_start', (event) => {
          logger.info('chat.event.received');
          stream.progress(`Running ${event.toolName}...`);
        }),
      );

      disposables.push(
        rpcBridge.onEvent<ToolExecutionEnd>('tool_execution_end', (_event) => {
          logger.info('chat.event.received');
        }),
      );

      disposables.push(
        rpcBridge.onEvent('turn_end', () => {
          logger.info('chat.event.received');
          clearTimeout(timeout);
          resolve();
        }),
      );

      disposables.push(
        rpcBridge.onEvent('result', () => {
          logger.info('chat.event.received');
          clearTimeout(timeout);
          resolve();
        }),
      );

      disposables.push(
        rpcBridge.onEvent('error', (event) => {
          clearTimeout(timeout);
          void event;
          logger.error('chat.request.failed');
          reject(new Error('xcsh request failed'));
        }),
      );

      token.onCancellationRequested(() => {
        rpcBridge.abort();
        clearTimeout(timeout);
        resolve();
      });
    });

    rpcBridge.prompt(enrichedPrompt, { locale: vscode.env.language });

    try {
      await messagePromise;
    } catch {
      logger.error('chat.request.failed');
      stream.markdown(`\n\n**${vscode.l10n.t('Error')}:** ${vscode.l10n.t('Request failed')}`);
    } finally {
      logger.info('chat.request.completed');
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

  participant.onDidReceiveFeedback((_feedback: vscode.ChatResultFeedback) => {
    logger.info('chat.event.received');
  });

  extensionContext.subscriptions.push(participant);

  logger.info('chat.registered');

  return participant;
}
