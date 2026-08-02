// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const sharedTransform = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      tsconfig: 'tsconfig.test.json',
      useESM: false,
      diagnostics: {
        ignoreCodes: [151002, 2554, 2307, 7016, 7026, 17004, 7006],
      },
    },
  ],
};

const sharedModuleNameMapper = {
  '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
  // pi-utils ships ESM TypeScript source via an `exports` wildcard; jest-resolve
  // doesn't honor that subpath, so map it straight to the source file (and the
  // transformIgnorePatterns exception below lets ts-jest compile it).
  '^@f5-sales-demo/pi-utils/(.*)$': '<rootDir>/node_modules/@f5-sales-demo/pi-utils/src/$1.ts',
};

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
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/unit/**/*.test.ts', ...(process.env.XCSH_API_URL ? ['**/integration/live*.test.ts'] : [])],
      testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/out/',
        ...(process.env.XCSH_API_URL ? [] : ['/integration/']),
      ],
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: sharedModuleNameMapper,
      transform: sharedTransform,
      // Transform pi-utils' shared TypeScript source (ignored node_modules otherwise).
      transformIgnorePatterns: ['/node_modules/(?!@f5-sales-demo/pi-utils/)'],
    },
    {
      displayName: 'webview',
      preset: 'ts-jest',
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
          'ts-jest',
          {
            // No `diagnostics.ignoreCodes` here: webview/tsconfig.json sets
            // `isolatedModules`, so ts-jest transpiles per file and never produces
            // semantic diagnostics — an ignore list for codes like TS2307/TS2554
            // could never fire and only implied a suppression that wasn't happening.
            // Verified: a TS2304 in either a component or a test file leaves this
            // suite fully green. Type checking is gated by `npm run typecheck:webview`
            // (a full-program `tsc`), not by jest. See #995.
            tsconfig: '<rootDir>/webview/tsconfig.test.json',
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
