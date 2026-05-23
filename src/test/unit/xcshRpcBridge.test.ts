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
    expect(parsed.text).toBe('What is F5 XC?');
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

    stdout.write(`${JSON.stringify({ type: 'message_update', text: 'first' })}\n`);
    stdout.write(`${JSON.stringify({ type: 'message_update', text: 'second' })}\n`);

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
});
