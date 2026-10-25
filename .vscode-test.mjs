import { defineConfig } from '@vscode/test-cli';
// The CLI resolves this runtime driver dynamically, so keep an explicit import
// to make the required package visible to dependency analysis and clean installs.
import '@vscode/test-electron';

const userDataDir = process.env.VSCODE_TEST_USER_DATA_DIR;
const extensionsDir = process.env.VSCODE_TEST_EXTENSIONS_DIR;
const editorPath = process.env.VSCODE_TEST_EXECUTABLE;

export default defineConfig({
  files: 'out/test/integration/extension.test.js',
  version: 'stable',
  workspaceFolder: '.',
  ...(editorPath ? { useInstallation: { fromPath: editorPath } } : {}),
  launchArgs: [
    ...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []),
    ...(extensionsDir ? [`--extensions-dir=${extensionsDir}`] : []),
    '--disable-workspace-trust',
  ],
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true,
  },
});
