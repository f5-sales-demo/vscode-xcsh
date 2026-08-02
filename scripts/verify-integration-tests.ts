// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { globSync } from 'glob';

const EXPECTED_INTEGRATION_TESTS = ['out/test/integration/extension.test.js'];

function normalized(files: readonly string[]): string[] {
  return files.map((file) => file.split('\\').join('/')).sort();
}

export function validateIntegrationTestFiles(files: readonly string[]): void {
  const actual = normalized(files);
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_INTEGRATION_TESTS)) {
    throw new Error(
      `Integration test inventory mismatch: expected ${EXPECTED_INTEGRATION_TESTS.length}, compiled ${actual.length}`,
    );
  }
}

function main(): void {
  const files = globSync('out/test/integration/**/*.test.js', { nodir: true });
  validateIntegrationTestFiles(files);
  console.log(`Integration test inventory: ${files.length} compiled test file`);
}

if (require.main === module) {
  main();
}
