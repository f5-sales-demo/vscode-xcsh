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
      // Convert LanguageModelChatRequestMessages to simple format
      const simpleMessages: SimpleChatMessage[] = messages.map((msg) => ({
        role: msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant',
        content: extractTextFromMessageContent(msg.content),
      }));

      const promptText = convertMessagesToPrompt(simpleMessages);
      if (!promptText) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const disposables: vscode.Disposable[] = [];

        const cleanup = (): void => {
          for (const d of disposables) {
            d.dispose();
          }
        };

        disposables.push(
          rpcBridge.onMessageStream((event) => {
            progress.report(new vscode.LanguageModelTextPart(event.text));
          }),
        );

        disposables.push(
          rpcBridge.onEvent<RpcToolCall>('tool_call', (event) => {
            progress.report(new vscode.LanguageModelToolCallPart(event.toolCallId, event.toolName, event.arguments));
          }),
        );

        disposables.push(
          rpcBridge.onEvent('turn_end', () => {
            cleanup();
            resolve();
          }),
        );

        disposables.push(
          rpcBridge.onEvent('error', (event) => {
            cleanup();
            const msg = (event as Record<string, unknown>).message;
            reject(new Error(typeof msg === 'string' ? msg : 'xcsh streaming error'));
          }),
        );

        token.onCancellationRequested(() => {
          rpcBridge.abort();
          cleanup();
          resolve();
        });

        rpcBridge.prompt(promptText);
      });
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
