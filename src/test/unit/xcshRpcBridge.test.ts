// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { PassThrough } from 'node:stream';
import { XcshRpcBridge } from '../../xcsh/rpcBridge';
import type { RpcResponse } from '../../xcsh/types';

function createMockStreams() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  return { stdin, stdout };
}

describe('XcshRpcBridge', () => {
  let bridge: XcshRpcBridge;
  let stdin: PassThrough;
  let stdout: PassThrough;

  beforeEach(() => {
    const streams = createMockStreams();
    stdin = streams.stdin;
    stdout = streams.stdout;
    bridge = new XcshRpcBridge(stdin, stdout);
    bridge.init();
  });

  afterEach(() => {
    bridge.dispose();
    stdin.destroy();
    stdout.destroy();
  });

  it('serializes commands as JSONL', () => {
    const chunks: Buffer[] = [];
    stdin.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Fire-and-forget; we don't wait for response in this test
    bridge.sendCommand({ type: 'test_command', payload: 42 }).catch(() => {
      /* timeout expected */
    });

    const written = Buffer.concat(chunks).toString('utf-8');
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('test_command');
    expect(parsed.payload).toBe(42);
    expect(typeof parsed.id).toBe('string');
    expect(written.endsWith('\n')).toBe(true);
  });

  it('correlates responses by id', async () => {
    // Send a command
    const promise = bridge.sendCommand({ type: 'get_state' });

    // Read what was written to stdin to get the id
    const written = await new Promise<string>((resolve) => {
      stdin.once('data', (chunk: Buffer) => resolve(chunk.toString('utf-8')));
    });
    const sent = JSON.parse(written.trim());

    // Simulate response from xcsh
    const response: RpcResponse = {
      id: sent.id,
      type: 'response',
      command: 'get_state',
      success: true,
      data: { sessionId: 'abc' },
    };
    stdout.write(`${JSON.stringify(response)}\n`);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ sessionId: 'abc' });
  });

  it('dispatches events to listeners', async () => {
    const received: unknown[] = [];
    bridge.onEvent('message_update', (event) => {
      received.push(event);
    });

    stdout.write(`${JSON.stringify({ type: 'message_update', text: 'Hello' })}\n`);

    // Give the readline time to process
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'message_update', text: 'Hello' });
  });

  it('sends prompt command', () => {
    const chunks: Buffer[] = [];
    stdin.on('data', (chunk: Buffer) => chunks.push(chunk));

    bridge.prompt('What is F5 XC?');

    const written = Buffer.concat(chunks).toString('utf-8');
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('prompt');
    expect(parsed.message).toBe('What is F5 XC?');
  });

  it('sends abort command', () => {
    const chunks: Buffer[] = [];
    stdin.on('data', (chunk: Buffer) => chunks.push(chunk));

    bridge.abort();

    const written = Buffer.concat(chunks).toString('utf-8');
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('abort');
  });

  it('onMessageStream convenience dispatches message_update events', async () => {
    const texts: string[] = [];
    bridge.onMessageStream((event) => {
      texts.push(event.text);
    });

    stdout.write(
      `${JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'first' } })}\n`,
    );
    stdout.write(
      `${JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'second' } })}\n`,
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(texts).toEqual(['first', 'second']);
  });

  it('returns disposable from onEvent that unregisters listener', async () => {
    const received: unknown[] = [];
    const disposable = bridge.onEvent('message_update', (event) => {
      received.push(event);
    });

    stdout.write(`${JSON.stringify({ type: 'message_update', text: 'before' })}\n`);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    disposable.dispose();

    stdout.write(`${JSON.stringify({ type: 'message_update', text: 'after' })}\n`);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'message_update', text: 'before' });
  });

  it('ignores malformed JSON lines', async () => {
    const received: unknown[] = [];
    bridge.onEvent('message_update', (event) => {
      received.push(event);
    });

    stdout.write('this is not json\n');
    stdout.write(`${JSON.stringify({ type: 'message_update', text: 'valid' })}\n`);

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(received).toHaveLength(1);
  });

  it('getIntegrations sends command and returns data', async () => {
    const promise = bridge.getIntegrations();

    const written = await new Promise<string>((resolve) => {
      stdin.once('data', (chunk: Buffer) => resolve(chunk.toString('utf-8')));
    });
    const sent = JSON.parse(written.trim());
    expect(sent.type).toBe('get_integrations');

    const response: RpcResponse = {
      id: sent.id,
      type: 'response',
      command: 'get_integrations',
      success: true,
      data: {
        version: '18.77.2',
        model: { state: 'connected', provider: 'anthropic' },
        services: [
          { name: 'GitHub', state: 'connected' },
          { name: 'AWS', state: 'unauthenticated', hint: 'run: aws configure' },
        ],
      },
    };
    stdout.write(`${JSON.stringify(response)}\n`);

    const result = await promise;
    expect(result.version).toBe('18.77.2');
    expect(result.model.state).toBe('connected');
    expect(result.services).toHaveLength(2);
    const awsService = result.services.find((s) => s.name === 'AWS');
    expect(awsService?.state).toBe('unauthenticated');
    expect(awsService?.hint).toBe('run: aws configure');
  });

  it('setModel sends provider and modelId', async () => {
    const promise = bridge.setModel('anthropic', 'claude-sonnet-4-6');

    const written = await new Promise<string>((resolve) => {
      stdin.once('data', (chunk: Buffer) => resolve(chunk.toString('utf-8')));
    });
    const sent = JSON.parse(written.trim());
    expect(sent.type).toBe('set_model');
    expect(sent.provider).toBe('anthropic');
    expect(sent.modelId).toBe('claude-sonnet-4-6');

    const response: RpcResponse = {
      id: sent.id,
      type: 'response',
      command: 'set_model',
      success: true,
      data: { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
    };
    stdout.write(`${JSON.stringify(response)}\n`);

    await promise;
  });

  it('getIntegrations throws on failure response', async () => {
    const promise = bridge.getIntegrations();

    const written = await new Promise<string>((resolve) => {
      stdin.once('data', (chunk: Buffer) => resolve(chunk.toString('utf-8')));
    });
    const sent = JSON.parse(written.trim());

    const response: RpcResponse = {
      id: sent.id,
      type: 'response',
      command: 'get_integrations',
      success: false,
      error: 'Not supported',
    };
    stdout.write(`${JSON.stringify(response)}\n`);

    await expect(promise).rejects.toThrow('Not supported');
  });
});
