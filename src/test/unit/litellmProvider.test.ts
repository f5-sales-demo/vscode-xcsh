// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import {
  encodeGatewayMessages,
  gatewayEnvironment,
  LiteLLMProvider,
  registerLiteLLMProvider,
} from '../../xcsh/litellmProvider';

const config = { baseUrl: 'https://gateway.example.com', apiKey: 'synthetic-private-key' };
const model = {
  id: 'synthetic-model',
  name: 'synthetic-model',
  family: 'litellm',
  version: '1',
  apiBase: config.baseUrl,
  maxInputTokens: 10000,
  maxOutputTokens: 1000,
  capabilities: { toolCalling: true, imageInput: false },
};
function token(): vscode.CancellationToken {
  return { isCancellationRequested: false, onCancellationRequested: jest.fn(() => new vscode.Disposable(() => {})) };
}
const metadata = { data: [{ id: model.id, mode: 'chat', max_input_tokens: 10000, max_output_tokens: 1000 }] };
function sse(lines: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(new TextEncoder().encode(line));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('native LiteLLM provider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('discovers qualified chat models through the same origin without exposing credentials', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(new Response('<html>gateway</html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            ...metadata.data,
            { id: 'not-chat', mode: 'embedding', max_input_tokens: 10, max_output_tokens: 10 },
            { id: 'missing-limits', mode: 'chat' },
          ],
        }),
      );
    const provider = new LiteLLMProvider(() => config, request);
    const result = await provider.provideLanguageModelChatInformation({ silent: true }, token());
    expect(result).toHaveLength(1);
    expect(result[0]?.apiBase).toBe(`${config.baseUrl}/openai/v1`);
    expect(result[0]?.maxInputTokens).toBe(10000);
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(request).toHaveBeenLastCalledWith(
      `${config.baseUrl}/openai/v1/models`,
      expect.objectContaining({ redirect: 'error', headers: { Authorization: `Bearer ${config.apiKey}` } }),
    );
  });

  it('preserves history and tool result identities with stable valid wire names', () => {
    const messages = [
      {
        role: vscode.LanguageModelChatMessageRole.User,
        name: undefined,
        content: [new vscode.LanguageModelTextPart('First request')],
      },
      {
        role: vscode.LanguageModelChatMessageRole.Assistant,
        name: undefined,
        content: [new vscode.LanguageModelToolCallPart('call-a', 'namespace/tool.name', { value: 1 })],
      },
      {
        role: vscode.LanguageModelChatMessageRole.User,
        name: undefined,
        content: [
          new vscode.LanguageModelToolResultPart('call-a', [new vscode.LanguageModelTextPart('result')]),
          new vscode.LanguageModelTextPart('Next request'),
        ],
      },
    ];
    const result = encodeGatewayMessages(messages);
    expect(result[0]).toEqual({ role: 'user', content: 'First request' });
    expect(result[1]?.tool_calls).toEqual([
      expect.objectContaining({
        id: 'call-a',
        function: expect.objectContaining({
          name: expect.stringMatching(/^tool_[a-f0-9]{24}$/),
          arguments: '{"value":1}',
        }),
      }),
    ]);
    expect(result[2]).toEqual({ role: 'tool', tool_call_id: 'call-a', content: 'result' });
    expect(result).toContainEqual({ role: 'user', content: 'Next request' });
    expect(() => encodeGatewayMessages([{ ...messages[0]!, content: [{ value: 'unsupported' }] }])).toThrow(
      'LITELLM_CONTENT_UNSUPPORTED',
    );
  });

  it('streams text and reconstructs fragmented calls using native tool names', async () => {
    const request = jest.fn().mockImplementation((_url, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      const name = body.tools[0].function.name;
      expect(body.tool_choice).toBe('required');
      expect(body.model).toBe(model.id);
      return Promise.resolve(
        sse([
          'data: {"choices":[{"delta":{"content":"hello ✓"}}]}\n\n',
          `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-a', function: { name, arguments: '{"value":' } }] } }] })}\n`,
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n',
          'data: [DONE]\n\n',
        ]),
      );
    });
    const provider = new LiteLLMProvider(() => config, request);
    const report = jest.fn();
    await provider.provideLanguageModelChatResponse(
      model,
      [
        {
          role: vscode.LanguageModelChatMessageRole.User,
          name: undefined,
          content: [new vscode.LanguageModelTextPart('test')],
        },
      ],
      {
        toolMode: vscode.LanguageModelChatToolMode.Required,
        tools: [{ name: 'namespace/tool.name', description: 'synthetic tool', inputSchema: { type: 'object' } }],
      },
      { report },
      token(),
    );
    expect(report).toHaveBeenCalledWith(new vscode.LanguageModelTextPart('hello ✓'));
    expect(report).toHaveBeenCalledWith(
      new vscode.LanguageModelToolCallPart('call-a', 'namespace/tool.name', { value: 1 }),
    );
  });

  it('rejects incomplete streams, unknown tools, and credential/network failures without retry', async () => {
    for (const response of [
      new Response('private rejection', { status: 401 }),
      sse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n']),
      sse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"x","function":{"name":"unknown","arguments":"{}"}}]}}]}\ndata: [DONE]\n',
      ]),
    ]) {
      const request = jest.fn().mockResolvedValue(response);
      const provider = new LiteLLMProvider(() => config, request);
      await expect(
        provider.provideLanguageModelChatResponse(
          model,
          [],
          { toolMode: vscode.LanguageModelChatToolMode.Auto },
          { report: jest.fn() },
          token(),
        ),
      ).rejects.toThrow('LITELLM_REQUEST_FAILED');
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects canceled requests and changed endpoint configuration before transport', async () => {
    const request = jest.fn();
    const provider = new LiteLLMProvider(() => config, request);
    await expect(
      provider.provideLanguageModelChatResponse(
        model,
        [],
        { toolMode: vscode.LanguageModelChatToolMode.Auto },
        { report: jest.fn() },
        { ...token(), isCancellationRequested: true },
      ),
    ).rejects.toThrow('LITELLM_CANCELED');
    await expect(
      new LiteLLMProvider(
        () => ({ ...config, baseUrl: `${config.baseUrl}/changed` }),
        request,
      ).provideLanguageModelChatResponse(
        model,
        [],
        { toolMode: vscode.LanguageModelChatToolMode.Auto },
        { report: jest.fn() },
        token(),
      ),
    ).rejects.toThrow('LITELLM_CONFIGURATION_CHANGED');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not register an unsupported Kiro provider or change the editor model', () => {
    jest.replaceProperty(vscode.env, 'appName', 'Kiro');
    try {
      expect(registerLiteLLMProvider({ subscriptions: [] } as unknown as vscode.ExtensionContext)).toBe(false);
      expect(vscode.lm.registerLanguageModelChatProvider).not.toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('requires safe configured environment URLs', () => {
    const prior = { url: process.env.LITELLM_BASE_URL, key: process.env.LITELLM_API_KEY };
    try {
      process.env.LITELLM_BASE_URL = 'https://gateway.example.com';
      process.env.LITELLM_API_KEY = 'synthetic-key';
      expect(gatewayEnvironment()).toEqual({ baseUrl: 'https://gateway.example.com', apiKey: 'synthetic-key' });
      process.env.LITELLM_BASE_URL = 'https://user:password@gateway.example.com';
      expect(() => gatewayEnvironment()).toThrow('LITELLM_CONFIGURATION_INVALID');
    } finally {
      if (prior.url === undefined) {
        delete process.env.LITELLM_BASE_URL;
      } else {
        process.env.LITELLM_BASE_URL = prior.url;
      }
      if (prior.key === undefined) {
        delete process.env.LITELLM_API_KEY;
      } else {
        process.env.LITELLM_API_KEY = prior.key;
      }
    }
  });
});

it('cancels in-flight transport when the native provider is disposed', async () => {
  const request = jest.fn(
    (_url, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) {
          throw new Error('Synthetic signal required');
        }
        signal.addEventListener('abort', () => reject(new Error('synthetic-abort')), { once: true });
      }),
  );
  const provider = new LiteLLMProvider(() => config, request);
  const pending = provider.provideLanguageModelChatResponse(
    model,
    [],
    { toolMode: vscode.LanguageModelChatToolMode.Auto },
    { report: jest.fn() },
    token(),
  );
  provider.dispose();
  await expect(pending).rejects.toThrow('LITELLM_CANCELED');
  await expect(
    provider.provideLanguageModelChatResponse(
      model,
      [],
      { toolMode: vscode.LanguageModelChatToolMode.Auto },
      { report: jest.fn() },
      token(),
    ),
  ).rejects.toThrow('LITELLM_CANCELED');
  expect(request).toHaveBeenCalledTimes(1);
});
