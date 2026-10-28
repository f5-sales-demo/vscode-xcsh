// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { ManagedWorkspaceAgent } from '../../xcsh/nativeWorkspaceAgent';

let root: string;
let available: boolean;
let agent: ManagedWorkspaceAgent;
const document = "---\nname: xcsh\ntools: ['xcshF5']\n---\nUse xcshF5.\n";
const create = () => new ManagedWorkspaceAgent({ document, isAvailable: () => available });

beforeEach(async () => {
  jest.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), 'xcsh-workspace-agent-'));
  available = true;
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', [{ uri: vscode.Uri.file(root), name: 'test', index: 0 }]);
  jest.replaceProperty(vscode.workspace, 'isTrusted', true);
  jest.spyOn(vscode.workspace, 'applyEdit').mockImplementation(async (edit) => {
    const creations = (
      edit as unknown as {
        creations: Array<{
          uri: vscode.Uri;
          options: { contents: Uint8Array; overwrite: boolean; ignoreIfExists: boolean };
        }>;
      }
    ).creations;
    for (const creation of creations) {
      expect(creation.options.overwrite).toBe(false);
      expect(creation.options.ignoreIfExists).toBe(false);
      try {
        await writeFile(creation.uri.fsPath, creation.options.contents, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          return false;
        }
        throw error;
      }
    }
    return true;
  });
  agent = create();
});
afterEach(async () => {
  agent.dispose();
  await rm(root, { recursive: true, force: true });
  jest.restoreAllMocks();
});

it('publishes a stable complete document and reuses it across windows and reloads', async () => {
  const second = create();
  const [firstUri, secondUri] = await Promise.all([agent.ensure(), second.ensure()]);
  expect(firstUri.fsPath).toBe(join(root, '.github', 'agents', 'xcsh.agent.md'));
  expect(secondUri.toString()).toBe(firstUri.toString());
  const content = await readFile(firstUri.fsPath, 'utf8');
  expect(content).toContain(document);
  expect(content).not.toContain('model:');
  expect(await readdir(join(root, '.github', 'agents'))).toEqual(['xcsh.agent.md']);
  agent.dispose();
  await second.verify();
  expect((await create().ensure()).toString()).toBe(firstUri.toString());
  expect(await readFile(firstUri.fsPath, 'utf8')).toBe(content);
  second.dispose();
});

it('publishes through the public editor file API so native agent discovery sees creation', async () => {
  await agent.ensure();
  expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
});

it('does not retry a failed editor file creation', async () => {
  jest.mocked(vscode.workspace.applyEdit).mockResolvedValue(false);
  await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_NOT_READY');
  expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
});

it('preserves a user file created concurrently with the editor edit', async () => {
  const path = join(root, '.github', 'agents', 'xcsh.agent.md');
  jest.mocked(vscode.workspace.applyEdit).mockImplementationOnce(async () => {
    await writeFile(path, 'Concurrent user instructions', { flag: 'wx' });
    return false;
  });
  await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  expect(await readFile(path, 'utf8')).toBe('Concurrent user instructions');
  expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
});

it.each(['CANCELED', 'NATIVE_AGENT_UNAVAILABLE', 'STALE_WORKSPACE'])(
  'rechecks %s after an awaited editor publication without retrying',
  async (expected) => {
    const publish = jest.mocked(vscode.workspace.applyEdit).getMockImplementation();
    if (!publish) {
      throw new Error('Missing test publisher');
    }
    const token = { isCancellationRequested: false } as vscode.CancellationToken;
    jest.mocked(vscode.workspace.applyEdit).mockImplementationOnce(async (edit) => {
      const result = await publish(edit);
      if (expected === 'CANCELED') {
        Object.assign(token, { isCancellationRequested: true });
      }
      if (expected === 'NATIVE_AGENT_UNAVAILABLE') {
        available = false;
      }
      if (expected === 'STALE_WORKSPACE') {
        jest.replaceProperty(vscode.workspace, 'workspaceFolders', []);
      }
      return result;
    });
    await expect(agent.ensure(token)).rejects.toThrow(expected);
    expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(await readFile(join(root, '.github', 'agents', 'xcsh.agent.md'), 'utf8')).toContain(document);
  },
);

it('preserves a preexisting user agent and refuses ownership', async () => {
  const directory = join(root, '.github', 'agents');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'xcsh.agent.md');
  await writeFile(path, document);
  await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  expect(await readFile(path, 'utf8')).toBe(document);
  expect(await readdir(directory)).toEqual(['xcsh.agent.md']);
});

it('preserves user edits across verification, reload and a different instruction version', async () => {
  const uri = await agent.ensure();
  await writeFile(uri.fsPath, document + '\nUser instructions.\n');
  await expect(agent.verify()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  await expect(create().ensure()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  const newer = new ManagedWorkspaceAgent({ document: document + 'New instructions.\n', isAvailable: () => true });
  await expect(newer.ensure()).rejects.toThrow('NATIVE_AGENT_CONFLICT');
  expect(await readFile(uri.fsPath, 'utf8')).toContain('User instructions.');
  newer.dispose();
});

it.each(['.github', '.github/agents', '.github/agents/xcsh.agent.md'])(
  'rejects symlink registration at %s',
  async (relative) => {
    const outside = await mkdtemp(join(tmpdir(), 'xcsh-outside-agent-'));
    try {
      const destination = join(root, relative);
      await mkdir(join(destination, '..'), { recursive: true });
      const target = relative.endsWith('.md') ? join(outside, 'agent.md') : outside;
      if (relative.endsWith('.md')) {
        await writeFile(target, 'User file');
      }
      await symlink(target, destination);
      await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_UNSAFE_PATH');
      expect(await readdir(outside)).toEqual(relative.endsWith('.md') ? ['agent.md'] : []);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  },
);

it('fails closed when a registered file is removed or replaced with a symlink', async () => {
  const uri = await agent.ensure();
  await rm(uri.fsPath);
  await expect(agent.verify()).rejects.toThrow('NATIVE_AGENT_NOT_READY');
  await symlink(join(root, 'missing'), uri.fsPath);
  await expect(agent.verify()).rejects.toThrow('NATIVE_AGENT_UNSAFE_PATH');
});

it('blocks Kiro, untrusted, empty, remote and multiple-root workspaces before writing', async () => {
  jest.replaceProperty(vscode.env, 'appName', 'Kiro');
  await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  jest.replaceProperty(vscode.env, 'appName', 'Visual Studio Code');
  jest.replaceProperty(vscode.workspace, 'isTrusted', false);
  await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  jest.replaceProperty(vscode.workspace, 'isTrusted', true);
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', []);
  await expect(create().ensure()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  const remote = Object.assign(vscode.Uri.parse('vscode-remote://ssh-remote/test'), { scheme: 'vscode-remote' });
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', [{ uri: remote, name: 'test', index: 0 }]);
  await expect(create().ensure()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  jest.replaceProperty(
    vscode.workspace,
    'workspaceFolders',
    [0, 1].map((index) => ({ uri: vscode.Uri.file(root), name: 'test', index })),
  );
  await expect(create().ensure()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  expect(await readdir(root)).toEqual([]);
});

it('rejects canceled, disposed and stale workspace registrations without recreating files', async () => {
  await expect(agent.ensure({ isCancellationRequested: true } as vscode.CancellationToken)).rejects.toThrow('CANCELED');
  jest.replaceProperty(vscode.workspace, 'workspaceFolders', [
    { uri: vscode.Uri.file(join(root, 'other')), name: 'other', index: 0 },
  ]);
  await expect(agent.ensure()).rejects.toThrow('STALE_WORKSPACE');
  agent.dispose();
  await expect(agent.ensure()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  expect(await readdir(root)).toEqual([]);
});

it('retains the file but revokes this window when core readiness is lost', async () => {
  const uri = await agent.ensure();
  available = false;
  await expect(agent.verify()).rejects.toThrow('NATIVE_AGENT_UNAVAILABLE');
  agent.dispose();
  expect(await readFile(uri.fsPath, 'utf8')).toContain(document);
});
