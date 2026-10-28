// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

export const LITELLM_VENDOR = 'xcsh-litellm';
interface GatewayConfig {
  baseUrl: string;
  apiKey: string;
}
interface GatewayModel extends vscode.LanguageModelChatInformation {
  readonly apiBase: string;
}
type WireMessage = { role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string };

export function gatewayEnvironment(): GatewayConfig | undefined {
  const baseUrl = process.env.LITELLM_BASE_URL?.trim();
  const apiKey = process.env.LITELLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    return undefined;
  }
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('LITELLM_CONFIGURATION_INVALID');
  }
  return { baseUrl: url.href.replace(/\/+$/, ''), apiKey };
}

const wireName = (name: string): string => `tool_${createHash('sha256').update(name).digest('hex').slice(0, 24)}`;

export function encodeGatewayMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): WireMessage[] {
  return messages.flatMap((message) => {
    const text: string[] = [];
    const calls: unknown[] = [];
    const results: WireMessage[] = [];
    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        text.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        calls.push({
          id: part.callId,
          type: 'function',
          function: { name: wireName(part.name), arguments: JSON.stringify(part.input) },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        const content = part.content
          .map((value) => {
            if (!(value instanceof vscode.LanguageModelTextPart)) {
              throw new Error('LITELLM_CONTENT_UNSUPPORTED');
            }
            return String(value.value);
          })
          .join('\n');
        results.push({ role: 'tool', tool_call_id: part.callId, content });
      } else {
        throw new Error('LITELLM_CONTENT_UNSUPPORTED');
      }
    }
    const role = message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user';
    const own: WireMessage[] =
      text.length || calls.length
        ? [{ role, content: text.join('\n'), ...(calls.length ? { tool_calls: calls } : {}) }]
        : [];
    return role === 'user' ? [...results, ...own] : [...own, ...results];
  });
}

/** Native VS Code provider. Authentication comes only from the gateway environment. */
export class LiteLLMProvider implements vscode.LanguageModelChatProvider<GatewayModel>, vscode.Disposable {
  private readonly active = new Set<AbortController>();
  private disposed = false;

  dispose(): void {
    this.disposed = true;
    for (const controller of this.active) {
      controller.abort();
    }
    this.active.clear();
  }
  constructor(
    private readonly configuration = gatewayEnvironment,
    private readonly request: typeof fetch = fetch,
  ) {}

  private controller(token: vscode.CancellationToken): { controller: AbortController; dispose: () => void } {
    const controller = new AbortController();
    if (token.isCancellationRequested || this.disposed) {
      controller.abort();
    }
    this.active.add(controller);
    const listener = token.onCancellationRequested(() => controller.abort());
    return {
      controller,
      dispose: () => {
        listener.dispose();
        this.active.delete(controller);
      },
    };
  }

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<GatewayModel[]> {
    const config = this.configuration();
    if (!config) {
      return [];
    }
    const abort = this.controller(token);
    try {
      const candidates = [...new Set([config.baseUrl, `${config.baseUrl}/v1`, `${config.baseUrl}/openai/v1`])];
      for (const apiBase of candidates) {
        if (abort.controller.signal.aborted) {
          throw new Error('LITELLM_CANCELED');
        }
        const response = await this.request(`${apiBase}/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          redirect: 'error',
          signal: AbortSignal.any([abort.controller.signal, AbortSignal.timeout(20_000)]),
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error('LITELLM_AUTHENTICATION_FAILED');
        }
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          continue;
        }
        const value = (await response.json()) as { data?: Array<Record<string, unknown>> };
        if (!Array.isArray(value.data)) {
          continue;
        }
        return value.data.flatMap((model) => {
          if (
            model.mode !== 'chat' ||
            typeof model.id !== 'string' ||
            !Number.isInteger(model.max_input_tokens) ||
            !Number.isInteger(model.max_output_tokens) ||
            Number(model.max_input_tokens) <= 0 ||
            Number(model.max_output_tokens) <= 0
          ) {
            return [];
          }
          return [
            {
              id: model.id,
              name: model.id,
              family: 'litellm',
              version: '1',
              apiBase,
              maxInputTokens: Number(model.max_input_tokens),
              maxOutputTokens: Number(model.max_output_tokens),
              capabilities: { toolCalling: true, imageInput: false },
            },
          ];
        });
      }
      throw new Error('LITELLM_MODEL_CATALOG_UNAVAILABLE');
    } catch (error) {
      if (abort.controller.signal.aborted) {
        throw new Error('LITELLM_CANCELED', { cause: error });
      }
      throw new Error('LITELLM_MODEL_CATALOG_UNAVAILABLE', { cause: error });
    } finally {
      abort.dispose();
    }
  }

  async provideLanguageModelChatResponse(
    model: GatewayModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const config = this.configuration();
    if (!config) {
      throw new Error('LITELLM_CONFIGURATION_UNAVAILABLE');
    }
    if (![config.baseUrl, `${config.baseUrl}/v1`, `${config.baseUrl}/openai/v1`].includes(model.apiBase)) {
      throw new Error('LITELLM_CONFIGURATION_CHANGED');
    }
    const aliases = new Map((options.tools ?? []).map((tool) => [wireName(tool.name), tool.name]));
    const tools = options.tools?.map((tool) => ({
      type: 'function',
      function: { name: wireName(tool.name), description: tool.description, parameters: tool.inputSchema },
    }));
    if (options.toolMode === vscode.LanguageModelChatToolMode.Required && !tools?.length) {
      throw new Error('LITELLM_TOOLS_UNAVAILABLE');
    }
    const abort = this.controller(token);
    try {
      if (abort.controller.signal.aborted) {
        throw new Error('LITELLM_CANCELED');
      }
      const response = await this.request(`${model.apiBase}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([abort.controller.signal, AbortSignal.timeout(120_000)]),
        body: JSON.stringify({
          model: model.id,
          messages: encodeGatewayMessages(messages),
          stream: true,
          ...(tools?.length
            ? {
                tools,
                tool_choice: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
              }
            : {}),
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`LITELLM_REQUEST_FAILED_${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      const calls = new Map<number, { id: string; name: string; arguments: string }>();
      try {
        while (!done) {
          const part = await reader.read();
          const bytes: Uint8Array | undefined = part.value instanceof Uint8Array ? part.value : undefined;
          if (part.value !== undefined && !bytes) {
            throw new Error('LITELLM_RESPONSE_UNSUPPORTED');
          }
          buffer += decoder.decode(bytes, { stream: !part.done });
          if (buffer.length > 4 * 1024 * 1024) {
            throw new Error('LITELLM_RESPONSE_TOO_LARGE');
          }
          while (true) {
            const newline = buffer.indexOf('\n');
            if (newline < 0) {
              break;
            }
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith('data:')) {
              continue;
            }
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              done = true;
              break;
            }
            const value = JSON.parse(data) as {
              error?: unknown;
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
                };
              }>;
            };
            if (value.error) {
              throw new Error('LITELLM_STREAM_FAILED');
            }
            const delta = value.choices?.[0]?.delta;
            if (delta?.content) {
              progress.report(new vscode.LanguageModelTextPart(delta.content));
            }
            for (const fragment of delta?.tool_calls ?? []) {
              const call = calls.get(fragment.index) ?? { id: '', name: '', arguments: '' };
              call.id += fragment.id ?? '';
              call.name += fragment.function?.name ?? '';
              call.arguments += fragment.function?.arguments ?? '';
              if (call.arguments.length > 4 * 1024 * 1024) {
                throw new Error('LITELLM_RESPONSE_TOO_LARGE');
              }
              calls.set(fragment.index, call);
            }
          }
          if (part.done && !done) {
            throw new Error('LITELLM_STREAM_INCOMPLETE');
          }
        }
        const complete: vscode.LanguageModelToolCallPart[] = [];
        for (const call of calls.values()) {
          const name = aliases.get(call.name);
          if (!name || !call.id) {
            throw new Error('LITELLM_TOOL_UNKNOWN');
          }
          const input = JSON.parse(call.arguments || '{}') as object;
          complete.push(new vscode.LanguageModelToolCallPart(call.id, name, input));
        }
        if (abort.controller.signal.aborted) {
          throw new Error('LITELLM_CANCELED');
        }
        for (const part of complete) {
          progress.report(part);
        }
      } finally {
        await reader.cancel();
      }
    } catch (error) {
      throw new Error(abort.controller.signal.aborted ? 'LITELLM_CANCELED' : 'LITELLM_REQUEST_FAILED', {
        cause: error,
      });
    } finally {
      abort.dispose();
    }
  }

  provideTokenCount(
    _model: GatewayModel,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    // Conservative byte bound until the gateway exposes its tokenizer interface.
    return Promise.resolve(
      Buffer.byteLength(typeof text === 'string' ? text : JSON.stringify(text.content), 'utf8') + 32,
    );
  }
}

export function registerLiteLLMProvider(context: vscode.ExtensionContext): boolean {
  if (
    vscode.env.appName === 'Kiro' ||
    typeof vscode.lm?.registerLanguageModelChatProvider !== 'function' ||
    !process.env.LITELLM_BASE_URL ||
    !process.env.LITELLM_API_KEY
  ) {
    return false;
  }
  const provider = new LiteLLMProvider();
  context.subscriptions.push(provider, vscode.lm.registerLanguageModelChatProvider(LITELLM_VENDOR, provider));
  return true;
}
