import { defineConfig } from '@vscode/test-cli';
// The CLI resolves this runtime driver dynamically, so keep an explicit import
// to make the required package visible to dependency analysis and clean installs.
import '@vscode/test-electron';

const userDataDir = process.env.VSCODE_TEST_USER_DATA_DIR;

export default defineConfig({
  files: 'out/test/integration/extension.test.js',
  version: 'stable',
  workspaceFolder: '.',
  launchArgs: userDataDir ? [`--user-data-dir=${userDataDir}`] : [],
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true,
  },
});
