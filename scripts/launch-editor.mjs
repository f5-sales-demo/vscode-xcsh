// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node scripts/launch-editor.mjs --editor vscode|kiro --state-dir ABSOLUTE_PRIVATE_DIR [--vsix ABSOLUTE_VSIX] [--inspect-port PORT]',
  );
  process.exit(0);
}
const allowed = new Set(['--editor', '--state-dir', '--vsix', '--inspect-port']);
const options = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.has(args[i]) || !args[i + 1] || options.has(args[i]))
    throw new Error('Invalid launch arguments; use --help');
  options.set(args[i], args[i + 1]);
}
const editor = options.get('--editor');
const app = { vscode: '/Applications/Visual Studio Code.app', kiro: '/Applications/Kiro.app' }[editor];
const state = options.get('--state-dir');
if (!app || !state || !path.isAbsolute(state))
  throw new Error('Choose an editor and an absolute private state directory');
if (state === source || state.startsWith(source + path.sep))
  throw new Error('Keep private editor state outside the source worktree');
const port = Number(options.get('--inspect-port') ?? (editor === 'kiro' ? 9331 : 9330));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid inspection port');
const vsix = options.get('--vsix');
if (vsix && (!path.isAbsolute(vsix) || !existsSync(vsix))) throw new Error('VSIX must be an existing absolute path');
const cli = path.join(app, 'Contents/Resources/app/bin/code');
if (!existsSync(cli)) throw new Error('Editor is not installed');
const root = path.join(state, editor);
if (path.join(root, 'user-data').length > 78)
  throw new Error('Use a shorter state directory to fit editor IPC socket limits');
for (const dir of [
  state,
  root,
  path.join(root, 'user-data/User'),
  path.join(root, 'extensions'),
  path.join(state, 'workspace'),
  path.join(state, 'xdg'),
]) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}
const settings = path.join(root, 'user-data/User/settings.json');
if (!existsSync(settings))
  writeFileSync(
    settings,
    JSON.stringify(
      {
        'workbench.startupEditor': 'none',
        'security.workspace.trust.enabled': false,
        'extensions.autoUpdate': false,
        'extensions.autoCheckUpdates': false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
const env = { ...process.env, XDG_CONFIG_HOME: path.join(state, 'xdg') };
// The shared private profile copy, rather than inherited credentials, is authoritative.
for (const key of [
  'XCSH_API_URL',
  'XCSH_API_TOKEN',
  'XCSH_CONTEXT_NAME',
  'XCSH_NAMESPACE',
  'XCSH_USERNAME',
  'XCSH_CONSOLE_PASSWORD',
])
  delete env[key];
const isolated = ['--user-data-dir', path.join(root, 'user-data'), '--extensions-dir', path.join(root, 'extensions')];
if (vsix)
  execFileSync(cli, [...isolated, '--install-extension', vsix, '--force'], {
    env,
    stdio: 'inherit',
  });
const launch = [...isolated, '--new-window', `--inspect-extensions=${port}`, '--disable-workspace-trust'];
if (!vsix) launch.push(`--extensionDevelopmentPath=${source}`);
launch.push(path.join(state, 'workspace'));
execFileSync(cli, launch, { env, stdio: 'inherit', timeout: 30000 });
const product = JSON.parse(readFileSync(path.join(app, 'Contents/Resources/app/product.json'), 'utf8'));
const receipt = {
  editor,
  version: product.version,
  apiVersion: product.vsCodeVersion ?? product.version,
  editorCommit: product.commit,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).trim(),
  mode: vsix ? 'vsix' : 'development',
  artifactSha256: vsix ? createHash('sha256').update(readFileSync(vsix)).digest('hex') : null,
  inspectPort: port,
  launcherCompleted: true,
  launchedAt: new Date().toISOString(),
};
writeFileSync(path.join(root, 'launch-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {
  mode: 0o600,
});
console.log(JSON.stringify(receipt));
