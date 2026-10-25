// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.dirname(fileURLToPath(import.meta.url));
const apps = { kiro: '/Applications/Kiro.app', vscode: '/Applications/Visual Studio Code.app' };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

export function prepare(state, transport = 'native') {
  if (!path.isAbsolute(state) || existsSync(state) || !['native', 'mcp'].includes(transport)) {
    throw new Error('Choose a fresh absolute private state directory and native or mcp transport');
  }
  mkdirSync(state, { mode: 0o700 });
  state = realpathSync(state);
  writeJson(path.join(state, 'campaign.json'), {
    kind: 'xcsh-native-chat-prototype',
    version: 1,
    transport,
  });
  for (const editor of Object.keys(apps)) {
    const fixture = path.join(state, editor, 'fixture');
    for (const directory of [
      fixture,
      path.join(state, editor, 'user-data/User'),
      path.join(state, editor, 'extensions'),
      path.join(state, 'xdg'),
    ]) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    writeJson(path.join(fixture, 'campaign-binding.json'), { root: state });
    writeJson(path.join(fixture, 'package.json'), {
      name: 'xcsh-selection-prototype',
      publisher: 'xcsh-experiment',
      version: '0.0.1',
      type: 'module',
      engines: { vscode: '^1.100.0' },
      main: './prototype.mjs',
      activationEvents: ['onStartupFinished'],
      contributes: {
        commands: ['openPanel', 'newSession', 'arguments', 'attachDraft'].map((command) => ({
          command: `xcshPrototype.${command}`,
          title: `xcsh Prototype: ${command}`,
        })),
        languageModelTools: [
          {
            name: 'xcsh-prototype-identity',
            displayName: 'Synthetic xcsh identity',
            modelDescription: 'Return harmless XCSH_PROTOTYPE_IDENTITY to verify transport.',
            canBeReferencedInPrompt: true,
            toolReferenceName: 'xcshPrototypeIdentity',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
        ],
      },
    });
    for (const file of ['prototype.mjs', 'identity-server.mjs']) {
      copyFileSync(path.join(source, file), path.join(fixture, file));
    }
    writeJson(path.join(state, editor, 'user-data/User/settings.json'), {
      'workbench.startupEditor': 'none',
      'security.workspace.trust.enabled': false,
      'extensions.autoUpdate': false,
      'extensions.autoCheckUpdates': false,
    });
    for (const window of ['a', 'b']) {
      const agents = path.join(state, 'workspaces', `${editor}-${window}`, '.kiro/agents');
      mkdirSync(agents, { recursive: true, mode: 0o700 });
      for (const [name, marker] of [
        ['xcsh', 'XCSH_PROTOTYPE_ALPHA'],
        ['xcsh-control', 'XCSH_PROTOTYPE_BETA'],
      ]) {
        const file = path.join(agents, `${name}.json`);
        writeJson(file, {
          name,
          description: `Harmless verification agent ${marker}`,
          prompt:
            `For transport verification, include the literal marker ${marker} in your response. ` +
            'When requested, call the identity tool once. Use no other tools.',
          tools: ['xcsh-prototype-identity'],
          includeMcpJson: false,
        });
        writeFileSync(`${file}.ownership`, hash(readFileSync(file)), { mode: 0o600 });
      }
    }
  }
  return state;
}

export function launch(state, editor, window = 'a', extensionPort = 9631, uiPort = 9632) {
  const app = apps[editor];
  if (
    !app ||
    !['a', 'b'].includes(window) ||
    !Number.isInteger(extensionPort) ||
    !Number.isInteger(uiPort) ||
    extensionPort < 1024 ||
    uiPort < 1024 ||
    extensionPort > 65535 ||
    uiPort > 65535 ||
    extensionPort === uiPort
  ) {
    throw new Error('Invalid editor, window or inspection ports');
  }
  const campaign = JSON.parse(readFileSync(path.join(state, 'campaign.json'), 'utf8'));
  if (campaign.kind !== 'xcsh-native-chat-prototype' || campaign.version !== 1) {
    throw new Error('Wrong task store');
  }
  const userData = path.join(state, editor, 'user-data');
  if (userData.length > 78) {
    throw new Error('Use a short private state path for editor IPC sockets');
  }
  const cli = path.join(app, 'Contents/Resources/app/bin/code');
  if (!existsSync(cli)) {
    throw new Error('The default-installed editor is unavailable');
  }
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(state, 'xdg') };
  for (const key of Object.keys(env)) {
    if (key.startsWith('XCSH_')) {
      delete env[key];
    }
  }
  const args = [
    '--user-data-dir',
    userData,
    '--extensions-dir',
    path.join(state, editor, 'extensions'),
    '--new-window',
    '--disable-workspace-trust',
    `--inspect-extensions=${extensionPort}`,
    `--remote-debugging-port=${uiPort}`,
    `--extensionDevelopmentPath=${path.join(state, editor, 'fixture')}`,
    path.join(state, 'workspaces', `${editor}-${window}`),
  ];
  execFileSync(cli, args, { env, stdio: 'inherit', timeout: 30000 });
  const product = JSON.parse(readFileSync(path.join(app, 'Contents/Resources/app/product.json'), 'utf8'));
  const receipt = {
    editor,
    window,
    version: product.version,
    apiVersion: product.vsCodeVersion ?? product.version,
    editorCommit: product.commit,
    fixtureSha256: hash(readFileSync(path.join(state, editor, 'fixture/prototype.mjs'))),
    extensionPort,
    uiPort,
    launchedAt: new Date().toISOString(),
    launcherCompleted: true,
    prototypeAccepted: false,
    packagedCoreAccepted: false,
  };
  writeJson(path.join(state, editor, `launch-${window}.json`), receipt);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, state, ...args] = process.argv.slice(2);
  if (action === 'prepare') {
    console.log(prepare(state, args[0]));
  } else if (action === 'launch') {
    console.log(
      JSON.stringify(
        launch(
          state,
          args[0],
          args[1],
          args[2] === undefined ? undefined : Number(args[2]),
          args[3] === undefined ? undefined : Number(args[3]),
        ),
      ),
    );
  } else {
    throw new Error(
      'Usage: campaign.mjs prepare ABSOLUTE_FRESH_STATE [native|mcp] | launch STATE kiro|vscode [a|b] [EXTENSION_PORT] [UI_PORT]',
    );
  }
}
