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
      setupFilesAfterEnv: ['@testing-library/jest-dom'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/webview/tsconfig.test.json',
            diagnostics: {
              ignoreCodes: [151002, 2554, 2307, 7016, 7026, 17004, 7006],
            },
          },
        ],
      },
    },
  ],
};
