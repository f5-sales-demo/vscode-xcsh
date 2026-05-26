// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { XcshRpcBridge } from './rpcBridge';
import type { RpcToolCall } from './types';

const MODEL_ID = 'f5xc-xcsh';
const MODEL_NAME = 'xcsh';

interface SimpleChatMessage {
  role: string;
  content: string;
}

/**
 * Extract the last user message text from a message array.
 *
 * This is used to convert VS Code language model chat messages
 * into a single prompt string for xcsh.
 */
export function convertMessagesToPrompt(messages: SimpleChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === 'user' && msg.content) {
      return msg.content;
    }
  }
  return '';
}

/**
 * Extract text content from a LanguageModelChatRequestMessage's content array.
 */
export function extractTextFromMessageContent(content: ReadonlyArray<unknown>): string {
  const parts: string[] = [];
  for (const part of content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      parts.push(part.value);
    } else if (typeof part === 'string') {
      parts.push(part);
    } else if (part && typeof part === 'object' && 'value' in part) {
      parts.push(String(part.value));
    }
  }
  return parts.join('');
}

/**
 * Register xcsh as a VS Code language model provider.
 *
 * This allows other extensions and Copilot to use xcsh as an
 * alternative language model via the `vscode.lm` API.
 */
export function registerLanguageModelProvider(
  extensionContext: vscode.ExtensionContext,
  rpcBridge: XcshRpcBridge,
): vscode.Disposable {
  const logger = getLogger();

  const modelInfo: vscode.LanguageModelChatInformation = {
    id: MODEL_ID,
    name: MODEL_NAME,
    family: 'f5xc-xcsh',
    version: '1.0.0',
    maxInputTokens: 200_000,
    maxOutputTokens: 16_000,
    capabilities: {
      toolCalling: true,
      imageInput: false,
    },
  };

  const provider: vscode.LanguageModelChatProvider = {
    provideLanguageModelChatInformation(
      _options: vscode.PrepareLanguageModelChatModelOptions,
      _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.LanguageModelChatInformation[]> {
      return [modelInfo];
    },

    async provideLanguageModelChatResponse(
      _model: vscode.LanguageModelChatInformation,
      messages: readonly vscode.LanguageModelChatRequestMessage[],
      _options: vscode.ProvideLanguageModelChatResponseOptions,
      progress: vscode.Progress<vscode.LanguageModelResponsePart>,
      token: vscode.CancellationToken,
    ): Promise<void> {
      const simpleMessages: SimpleChatMessage[] = messages.map((msg) => ({
        role: msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant',
        content: extractTextFromMessageContent(msg.content),
      }));

      const promptText = convertMessagesToPrompt(simpleMessages);
      if (!promptText) {
        return;
      }

      const disposables: vscode.Disposable[] = [];
      let receivedAnyEvent = false;
      let textChunkCount = 0;
      let resolveReason = 'unknown';
      const STREAM_TIMEOUT_MS = 120_000;

      const messagePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolveReason = 'timeout';
          logger.warn(
            `LM provider stream timed out after ${String(STREAM_TIMEOUT_MS)}ms (receivedAnyEvent=${String(receivedAnyEvent)}, textChunks=${String(textChunkCount)})`,
          );
          resolve();
        }, STREAM_TIMEOUT_MS);

        disposables.push(new vscode.Disposable(() => clearTimeout(timeout)));

        disposables.push(
          rpcBridge.onMessageStream((event) => {
            receivedAnyEvent = true;
            textChunkCount++;
            progress.report(new vscode.LanguageModelTextPart(event.text));
          }),
        );

        disposables.push(
          rpcBridge.onEvent<RpcToolCall>('tool_call', (event) => {
            receivedAnyEvent = true;
            progress.report(new vscode.LanguageModelToolCallPart(event.toolCallId, event.toolName, event.arguments));
          }),
        );

        disposables.push(
          rpcBridge.onEvent('tool_execution_start', (event) => {
            receivedAnyEvent = true;
            const toolName = (event as Record<string, unknown>).toolName;
            logger.info(`LM provider: tool_execution_start ${String(toolName)}`);
          }),
        );

        disposables.push(
          rpcBridge.onEvent('tool_execution_end', (event) => {
            receivedAnyEvent = true;
            const toolCallId = (event as Record<string, unknown>).toolCallId;
            logger.info(`LM provider: tool_execution_end ${String(toolCallId)}`);
          }),
        );

        disposables.push(
          rpcBridge.onEvent('turn_end', () => {
            receivedAnyEvent = true;
            resolveReason = 'turn_end';
            logger.info(`LM provider: turn_end (textChunks=${String(textChunkCount)})`);
            clearTimeout(timeout);
            resolve();
          }),
        );

        disposables.push(
          rpcBridge.onEvent('result', () => {
            receivedAnyEvent = true;
            resolveReason = 'result';
            logger.info(`LM provider: result event (textChunks=${String(textChunkCount)})`);
            clearTimeout(timeout);
            resolve();
          }),
        );

        disposables.push(
          rpcBridge.onEvent('error', (event) => {
            receivedAnyEvent = true;
            resolveReason = 'error';
            clearTimeout(timeout);
            const msg = (event as Record<string, unknown>).message;
            logger.error(`LM provider: error event: ${String(msg)}`);
            reject(new Error(typeof msg === 'string' ? msg : 'xcsh streaming error'));
          }),
        );

        token.onCancellationRequested(() => {
          resolveReason = 'cancelled';
          rpcBridge.abort();
          clearTimeout(timeout);
          resolve();
        });
      });

      rpcBridge.prompt(promptText);

      try {
        await messagePromise;
      } finally {
        logger.info(
          `LM provider: done (reason=${resolveReason}, events=${String(receivedAnyEvent)}, textChunks=${String(textChunkCount)})`,
        );
        for (const d of disposables) {
          d.dispose();
        }
      }
    },

    provideTokenCount(
      _model: vscode.LanguageModelChatInformation,
      text: string | vscode.LanguageModelChatRequestMessage,
      _token: vscode.CancellationToken,
    ): Thenable<number> {
      const str = typeof text === 'string' ? text : extractTextFromMessageContent(text.content);
      return Promise.resolve(Math.ceil(str.length / 4));
    },
  };

  const disposable = vscode.lm.registerLanguageModelChatProvider('f5xc', provider);
  extensionContext.subscriptions.push(disposable);

  logger.info(`Registered language model provider: ${MODEL_NAME}`);

  return disposable;
}
