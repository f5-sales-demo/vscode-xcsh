// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const sharedTransform = {
  '^.+\\.ts$': [
    '@swc/jest',
    {
      jsc: {
        parser: {
          syntax: 'typescript',
        },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    },
  ],
};

const sharedModuleNameMapper = {
  '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
  // pi-utils ships ESM TypeScript source via an `exports` wildcard; jest-resolve
  // doesn't honor that subpath, so map it straight to the source file (and the
  // transformIgnorePatterns exception below lets SWC compile it).
  '^@f5-sales-demo/pi-utils/(.*)$': '<rootDir>/node_modules/@f5-sales-demo/pi-utils/src/$1.ts',
};

const liveMode = process.env.XCSH_LIVE_TESTS;
if (!liveMode) {
  // Keep unit tests hermetic even on developer machines that have usable tenant
  // credentials in their shell. Individual tests may still set fixture values.
  delete process.env.XCSH_API_URL;
  delete process.env.XCSH_API_TOKEN;
  delete process.env.XCSH_USERNAME;
  delete process.env.XCSH_CONSOLE_PASSWORD;
  delete process.env.XCSH_TEST_NAMESPACE;
}
const liveReadOnlyTests = [
  '**/integration/liveApiSmoke.test.ts',
  '**/integration/liveQuotaUsage.test.ts',
  '**/integration/liveResourcePaths.test.ts',
];
const liveCrudTests = ['**/integration/liveCrud.test.ts'];

/** @type {import('jest').Config} */
module.exports = {
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 20,
      lines: 19,
      statements: 19,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**',
    '!src/extension.ts',
    '!src/generated/**',
    '!src/providers/xcshDiagramProvider.ts',
    '!src/commands/diagram.ts',
  ],
  verbose: true,
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        ...(!liveMode ? ['**/unit/**/*.test.ts'] : []),
        ...(liveMode === 'read-only' ? liveReadOnlyTests : []),
        ...(liveMode === 'crud' ? liveCrudTests : []),
      ],
      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/out/', ...(liveMode ? ['/unit/'] : ['/integration/'])],
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: sharedModuleNameMapper,
      transform: sharedTransform,
      // Transform pi-utils' shared TypeScript source (ignored node_modules otherwise).
      transformIgnorePatterns: ['/node_modules/(?!@f5-sales-demo/pi-utils/)'],
    },
    {
      displayName: 'webview',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/webview'],
      testMatch: ['**/__tests__/**/*.test.ts?(x)'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/out/'],
      moduleFileExtensions: ['tsx', 'ts', 'js', 'json'],
      // test-setup.ts imports jest-dom itself, so the matchers are registered there
      // rather than in two places — see the comment in that file.
      setupFilesAfterEnv: ['<rootDir>/webview/src/test-setup.ts'],
      transform: {
        '^.+\\.tsx?$': [
          '@swc/jest',
          {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              target: 'es2022',
              transform: {
                react: {
                  runtime: 'automatic',
                },
              },
            },
            module: { type: 'commonjs' },
          },
        ],
      },
      moduleNameMapper: {
        // The vendored chat-ui markdown renderer imports `marked`, whose "main"
        // entry is ESM (`lib/marked.esm.js`). jest leaves node_modules
        // untransformed and only transforms .tsx? here, so it chokes on the
        // `export`. Point it at marked's UMD build, which require() can load.
        // (Bundlers still take the ESM path — this affects tests only.)
        '^marked$': '<rootDir>/node_modules/marked/lib/marked.umd.js',
      },
    },
  ],
};
