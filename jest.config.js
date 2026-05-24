// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const sharedTransform = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      tsconfig: 'tsconfig.test.json',
      diagnostics: {
        ignoreCodes: [151002, 2554, 2307, 7016, 7026, 17004, 7006],
      },
    },
  ],
};

const sharedModuleNameMapper = {
  '^vscode$': '<rootDir>/src/test/__mocks__/vscode.ts',
  '^webview/(.*)$': '<rootDir>/webview/$1',
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
    '!src/providers/f5xcDiagramProvider.ts',
    '!src/providers/subscriptionDashboardProvider.ts',
    '!src/commands/diagram.ts',
    '!src/api/subscription.ts',
    '!src/tree/subscriptionNodes.ts',
    '!src/tree/subscriptionProvider.ts',
  ],
  verbose: true,
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: [
        '**/unit/**/*.test.ts',
        // Include integration live tests only when F5XC_API_URL is set
        ...(process.env.F5XC_API_URL ? ['**/integration/live*.test.ts'] : []),
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/out/',
        '/src/test/unit/webview/',
        // Skip integration tests by default unless env var is set
        ...(process.env.F5XC_API_URL ? [] : ['/integration/']),
      ],
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: sharedModuleNameMapper,
      transform: sharedTransform,
    },
    {
      displayName: 'webview',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src/test/unit/webview'],
      testMatch: ['**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/out/'],
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: sharedModuleNameMapper,
      transform: sharedTransform,
    },
  ],
};
