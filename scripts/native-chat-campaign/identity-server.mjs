// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

export const IDENTITY = 'XCSH_PROTOTYPE_IDENTITY';

/** A task-only, stateless Streamable HTTP endpoint. Never serves F5 operations. */
export async function startIdentityServer(record = () => {}) {
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  const server = createServer(async (request, response) => {
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(401).end();
      return;
    }
    if (request.url !== '/mcp') {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    const reply = (id, value) => {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id, ...value }));
    };
    let message;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      reply(message?.id ?? null, { error: { code: -32600, message: 'Invalid request' } });
      return;
    }
    record({ event: 'mcp-request', method: message.method });
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    switch (message.method) {
      case 'initialize':
        reply(message.id, {
          result: {
            protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'xcsh-prototype', version: '0.0.1' },
          },
        });
        break;
      case 'ping':
        reply(message.id, { result: {} });
        break;
      case 'tools/list':
        reply(message.id, {
          result: {
            tools: [
              {
                name: 'identity',
                description: `Return the harmless verification marker ${IDENTITY}.`,
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                annotations: {
                  readOnlyHint: true,
                  destructiveHint: false,
                  idempotentHint: true,
                  openWorldHint: false,
                },
              },
            ],
          },
        });
        break;
      case 'tools/call': {
        const args = message.params?.arguments;
        if (
          message.params?.name !== 'identity' ||
          !args ||
          Array.isArray(args) ||
          typeof args !== 'object' ||
          Object.keys(args).length !== 0
        ) {
          reply(message.id, { error: { code: -32602, message: 'Invalid identity request' } });
          break;
        }
        record({ event: 'mcp-identity-invoked' });
        reply(message.id, { result: { content: [{ type: 'text', text: IDENTITY }] } });
        break;
      }
      default:
        reply(message.id, { error: { code: -32601, message: 'Method not supported' } });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    headers: { Authorization: `Bearer ${token}` },
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
