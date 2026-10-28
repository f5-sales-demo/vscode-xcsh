// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * VSCode Extension Integration Tests
 * These tests run inside the VSCode Extension Development Host
 */

import * as assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('f5-sales-demo.xcsh');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('f5-sales-demo.xcsh');
    assert.ok(extension, 'Extension should be found');
  });

  test('Extension should activate', async () => {
    const extension = vscode.extensions.getExtension('f5-sales-demo.xcsh');
    assert.ok(extension, 'Extension should be found');

    if (!extension.isActive) {
      await extension.activate();
    }

    assert.strictEqual(extension.isActive, true, 'Extension should be active');
  });

  test('xcsh commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    // Check for core commands
    const expectedCommands = [
      'xcsh.refresh',
      'xcsh.addContext',
      'xcsh.editContext',
      'xcsh.deleteContext',
      'xcsh.setActiveContext',
      'xcsh.create',
      'xcsh.get',
      'xcsh.edit',
      'xcsh.delete',
      'xcsh.apply',
      'xcsh.diff',
      'xcsh.xcsh.openPanel',
      'xcsh.xcsh.newSession',
      'xcsh.attachToChat',
      'xcsh.xcsh.pairHerdr',
      'xcsh.xcsh.disconnectHerdr',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(commands.includes(cmd), `Command "${cmd}" should be registered`);
    }
  });

  test('xcsh views should be available', () => {
    // Views are declared in package.json, so they should exist
    // We can't directly test view visibility without UI interaction
    // but we can verify the extension doesn't throw during activation
    const extension = vscode.extensions.getExtension('f5-sales-demo.xcsh');
    assert.ok(extension?.isActive, 'Extension should be active with views registered');
  });

  test('Configuration should have expected properties', () => {
    const config = vscode.workspace.getConfiguration('xcsh');

    // Test that configuration keys exist
    const logLevel = config.get<string>('logLevel');
    const defaultNamespace = config.get<string>('defaultNamespace');
    const confirmDelete = config.get<boolean>('confirmDelete');
    const autoRefreshInterval = config.get<number>('autoRefreshInterval');

    // These should return the default values from package.json
    assert.ok(typeof logLevel === 'string' || logLevel === undefined);
    assert.ok(typeof defaultNamespace === 'string' || defaultNamespace === undefined);
    assert.ok(typeof confirmDelete === 'boolean' || confirmDelete === undefined);
    assert.ok(typeof autoRefreshInterval === 'number' || autoRefreshInterval === undefined);
  });
});

suite('Context Management Test Suite', () => {
  test('Add context command should be executable', async () => {
    // We can't fully test add context without mocking the input boxes
    // but we can verify the command exists and doesn't throw synchronously
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('xcsh.addContext'), 'addContext command should exist');
  });

  test('Refresh command should execute without error', async () => {
    // The refresh command should work even with no contexts
    try {
      await vscode.commands.executeCommand('xcsh.refresh');
      assert.ok(true, 'Refresh command executed successfully');
    } catch (error) {
      assert.fail(`Refresh command should not throw: ${error}`);
    }
  });
});

suite('Tree View Test Suite', () => {
  test('Explorer tree view should be registered', async () => {
    // Verify the tree view command context
    const commands = await vscode.commands.getCommands(true);
    const explorerCommands = commands.filter((cmd) => cmd.startsWith('xcsh.'));
    assert.ok(explorerCommands.length > 0, 'xcsh commands should be registered');
  });
});

suite('Editor compatibility', () => {
  test('keeps native operations behind explicit context activation', async () => {
    const commands = await vscode.commands.getCommands(true);
    if (vscode.env.appName === 'Kiro') {
      for (const command of ['xcsh.xcsh.openPanel', 'xcsh.xcsh.newSession', 'xcsh.attachToChat']) {
        assert.strictEqual(await vscode.commands.executeCommand(command), false, `${command} must stay gated`);
      }
    } else if (
      typeof vscode.lm?.invokeTool === 'function' &&
      commands.includes('workbench.action.chat.openNewChatSessionInPlace.local')
    ) {
      await assert.rejects(
        Promise.resolve(
          vscode.lm.invokeTool('xcsh-f5', { input: { action: 'discover' }, toolInvocationToken: undefined }),
        ),
        /NO_ACTIVE_CONTEXT/,
      );
    }
  });

  test('opens Contexts and records actual optional APIs', async () => {
    await vscode.commands.executeCommand('xcsh.profiles.focus');
    const extension = vscode.extensions.getExtension('f5-sales-demo.xcsh');
    assert.ok(extension?.isActive);
    assert.strictEqual(vscode.extensions.all.filter((candidate) => candidate.packageJSON.name === 'xcsh').length, 1);
    const commands = await vscode.commands.getCommands(true);
    const usesKiroChat = vscode.env.appName === 'Kiro';
    const nativeChatAvailable = usesKiroChat
      ? commands.includes('kiroAgent.focusChatInput')
      : commands.includes('workbench.action.chat.openNewChatSessionInPlace.local');
    const usesNativeChat = usesKiroChat || (nativeChatAvailable && typeof vscode.lm?.registerTool === 'function');
    if (usesKiroChat) {
      assert.ok(commands.includes('kiroAgent.focusChatInput'), 'Native Kiro chat must be available');
      const models = await vscode.lm.selectChatModels();
      assert.ok(
        models.every((model) => model.vendor !== 'xcsh'),
        'Kiro must own sidebar model selection',
      );
    }
    if (usesKiroChat) {
      await vscode.commands.executeCommand('xcsh.xcsh.openPanel');
    }
    const output = process.env.XCSH_EDITOR_API_RECEIPT;
    if (output) {
      writeFileSync(
        output,
        JSON.stringify(
          {
            editor: vscode.env.appName,
            apiVersion: vscode.version,
            extensionId: extension.id,
            extensionVersion: extension.packageJSON.version,
            active: extension.isActive,
            usesNativeChat,
            nativeChatAvailable,
            chatParticipant: typeof vscode.chat?.createChatParticipant === 'function',
            languageModelTools: typeof vscode.lm?.registerTool === 'function',
            languageModelProvider: typeof vscode.lm?.registerLanguageModelChatProvider === 'function',
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
    }
  });
});
