// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepare } from './campaign.mjs';
import { IDENTITY, startIdentityServer } from './identity-server.mjs';
import { assessCandidate, chooseRoute, ROUTING_CHECKS } from './route-gate.mjs';

const qualified = (route) => ({
  route,
  support: route === 'automatic' ? 'public-extension-api' : 'documented-native-selector',
  identityToolInvoked: true,
  defaultControlAvailable: true,
  defaultSetOnce: true,
  defaultPersisted: true,
  checks: [
    ...ROUTING_CHECKS.map((check) => ({
      check,
      passed: true,
      workspaceBinding: 'opaque-workspace-binding',
      conversationId: 'opaque-conversation',
      primaryAgent: 'xcsh',
      selectedModelBefore: 'editor-selected-model',
      selectedModelAfter: 'editor-selected-model',
      draftSubmitted: false,
      invocationAfterCancellation: false,
    })),
    {
      check: 'multipleWindows',
      passed: true,
      workspaceBinding: 'second-window-binding',
      conversationId: 'second-conversation',
      primaryAgent: 'xcsh',
      selectedModelBefore: 'editor-selected-model',
      selectedModelAfter: 'editor-selected-model',
    },
  ],
});

test('prefer automatic selection; prototype success keeps publication gated', () => {
  assert.deepEqual(chooseRoute([qualified('native-default'), qualified('automatic')]), {
    route: 'automatic',
    deliveryGated: true,
    reason: 'packaged-core-and-release-acceptance-required',
  });
});

test('delegation, debugger routing and manual per-session selection cannot qualify', () => {
  for (const changes of [{ route: 'delegation' }, { support: 'debugger' }, { support: 'documented-native-selector' }]) {
    assert.equal(assessCandidate({ ...qualified('automatic'), ...changes }).prototypeRouteAccepted, false);
  }
  for (const key of ['usedDebuggerRouting', 'manualSelectionRepeated']) {
    const candidate = qualified('automatic');
    candidate.checks[0][key] = true;
    assert.equal(assessCandidate(candidate).prototypeRouteAccepted, false);
  }
});

test('reject missing evidence, ordinary chat, model changes, submitted attachments and canceled invocations', () => {
  for (const change of [
    { primaryAgent: 'vibe' },
    { selectedModelAfter: 'another-model' },
    { conversationId: '' },
    { workspaceBinding: '' },
  ]) {
    const candidate = qualified('automatic');
    Object.assign(candidate.checks[0], change);
    assert.equal(assessCandidate(candidate).prototypeRouteAccepted, false);
  }
  for (const [check, key] of [
    ['attachment', 'draftSubmitted'],
    ['cancellation', 'invocationAfterCancellation'],
  ]) {
    const candidate = qualified('automatic');
    candidate.checks.find((value) => value.check === check)[key] = true;
    assert.equal(assessCandidate(candidate).prototypeRouteAccepted, false);
  }
  const missing = qualified('automatic');
  missing.checks.pop();
  assert.equal(assessCandidate(missing).prototypeRouteAccepted, false);
});

test('unavailable or nonpersistent default leaves Kiro gated', () => {
  for (const key of ['defaultControlAvailable', 'defaultSetOnce', 'defaultPersisted']) {
    assert.equal(chooseRoute([{ ...qualified('native-default'), [key]: false }]).route, null);
  }
  assert.equal(chooseRoute([{ ...qualified('automatic'), identityToolInvoked: false }]).route, null);
});

test('prepare requires fresh state and preserves a conflicting fixture', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'xcsh-prototype-test-'));
  try {
    const state = prepare(path.join(parent, 'state'));
    const agent = path.join(state, 'workspaces/kiro-a/.kiro/agents/xcsh.json');
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(agent, 'utf8')), 'model'), false);
    writeFileSync(agent, 'user-edited-fixture');
    assert.throws(() => prepare(state));
    assert.equal(readFileSync(agent, 'utf8'), 'user-edited-fixture');
    assert.throws(() => prepare(path.join(parent, 'invalid'), 'other'));
  } finally {
    rmSync(parent, { recursive: true });
  }
});

test('authenticated Streamable HTTP executes only the harmless identity tool', async () => {
  const events = [];
  const server = await startIdentityServer((event) => events.push(event));
  try {
    const send = (body, headers = server.headers) =>
      fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const message = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'identity', arguments: {} },
    };
    assert.equal((await send(message, {})).status, 401);
    assert.equal((await send(message, { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal(events.length, 0);
    const result = await (await send(message)).json();
    assert.equal(result.result.content[0].text, IDENTITY);
    for (const params of [
      { name: 'write', arguments: {} },
      { name: 'identity', arguments: { command: 'write' } },
      { name: 'identity', arguments: null },
      { name: 'identity', arguments: [] },
    ]) {
      assert.equal((await (await send({ ...message, params })).json()).error.code, -32602);
    }
    assert.equal(events.filter((event) => event.event === 'mcp-identity-invoked').length, 1);
    assert.equal((await send({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    assert.equal((await fetch(server.url, { headers: server.headers })).status, 405);
    assert.equal(
      (await fetch(server.url, { method: 'POST', headers: server.headers, body: 'x'.repeat(8193) })).status,
      413,
    );
    assert.equal(JSON.stringify(events).includes(server.headers.Authorization), false);
  } finally {
    await server.close();
  }
});
