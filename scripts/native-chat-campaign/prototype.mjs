// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { IDENTITY, startIdentityServer } from './identity-server.mjs';

const TOOL = 'xcsh-prototype-identity';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nativeCommands = new Set(['kiroAgent.focusChatInput', 'kiroAgent.newSession', 'kiroAgent.sessions.create']);

export async function activate(context) {
  const vscode = createRequire(import.meta.url)('vscode');
  const binding = JSON.parse(readFileSync(path.join(context.extensionPath, 'campaign-binding.json'), 'utf8'));
  const root = realpathSync(binding.root);
  if (!realpathSync(context.extensionPath).startsWith(root + path.sep)) {
    throw new Error('Invalid fixture binding');
  }
  const campaign = JSON.parse(readFileSync(path.join(root, 'campaign.json'), 'utf8'));
  if (campaign.kind !== 'xcsh-native-chat-prototype' || campaign.version !== 1) {
    throw new Error('This fixture requires a task-owned campaign store');
  }
  const record = (value) =>
    appendFileSync(
      path.join(root, 'events.jsonl'),
      `${JSON.stringify({
        time: new Date().toISOString(),
        pid: process.pid,
        ...value,
      })}\n`,
      { mode: 0o600 },
    );
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => realpathSync(folder.uri.fsPath));
  if (folders.length !== 1 || !folders[0].startsWith(path.join(root, 'workspaces') + path.sep)) {
    throw new Error('The prototype must run in exactly one task workspace');
  }
  record({
    event: 'activated',
    editor: vscode.env.appName,
    apiVersion: vscode.version,
    workspace: path.basename(folders[0]),
  });
  if (vscode.lm?.registerTool) {
    context.subscriptions.push(
      vscode.lm.registerTool(TOOL, {
        invoke: async (options, cancellation) => {
          if (cancellation.isCancellationRequested) {
            throw new Error('Identity call canceled');
          }
          if (!options.input || Object.keys(options.input).length) {
            throw new Error('Identity requires empty input');
          }
          record({ event: 'native-identity-invoked' });
          return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(IDENTITY)]);
        },
      }),
    );
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('xcshPrototype.command', async ({ command, options }) => {
      if (!nativeCommands.has(command) || (options?.submit !== undefined && options.submit !== false)) {
        throw new Error('Prototype commands are draft-only');
      }
      record({ event: 'command', command, options });
      const result = await vscode.commands.executeCommand(command, options);
      record({ event: 'command-complete', command });
      return result;
    }),
  );
  for (const [command, options] of [
    ['openPanel', { ensureSession: true }],
    ['newSession', { ensureSession: true, newSession: true }],
    [
      'arguments',
      {
        ensureSession: true,
        newSession: true,
        agent: 'xcsh',
        agentId: 'xcsh',
        modeId: 'xcsh',
        prompt: 'XCSH_ARGUMENT_DRAFT_ONLY',
        submit: false,
      },
    ],
    [
      'attachDraft',
      {
        ensureSession: true,
        prompt: 'Resource: synthetic-preview\n\n' + '```json\n{"metadata":{"name":"synthetic-preview"}}\n```',
        submit: false,
      },
    ],
  ]) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`xcshPrototype.${command}`, () =>
        vscode.commands.executeCommand('xcshPrototype.command', {
          command: 'kiroAgent.focusChatInput',
          options,
        }),
      ),
    );
  }
  record({
    event: 'capabilities',
    nativeTools: typeof vscode.lm?.registerTool,
    nativeAgentExports: Object.keys(vscode.extensions.getExtension('kiro.kiroAgent')?.exports ?? {}),
    commands: (await vscode.commands.getCommands(true)).filter((command) =>
      /^kiro.*(session|agent|mode|config)/i.test(command),
    ),
  });
  if (campaign.transport !== 'mcp' || vscode.env.appName !== 'Kiro') {
    return;
  }
  const server = await startIdentityServer(record);
  context.subscriptions.push({
    dispose: () => {
      void server.close().catch(() => record({ event: 'mcp-close-failed' }));
    },
  });
  for (const name of ['xcsh', 'xcsh-control']) {
    const file = path.join(folders[0], '.kiro/agents', `${name}.json`);
    const ownership = `${file}.ownership`;
    const bytes = readFileSync(file);
    if (readFileSync(ownership, 'utf8').trim() !== hash(bytes)) {
      record({ event: 'registration-conflict', agent: name });
      continue;
    }
    const agent = JSON.parse(bytes.toString('utf8'));
    agent.tools = ['@xcsh-prototype/identity'];
    agent.mcpServers = { 'xcsh-prototype': { url: server.url, headers: server.headers } };
    const replacement = `${JSON.stringify(agent, null, 2)}\n`;
    writeFileSync(file, replacement, { mode: 0o600 });
    writeFileSync(ownership, hash(replacement), { mode: 0o600 });
    record({ event: 'mcp-registration', agent: name });
  }
}
