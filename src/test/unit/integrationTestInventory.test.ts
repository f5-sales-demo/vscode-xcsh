// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { validateIntegrationTestFiles } from '../../../scripts/verify-integration-tests';

describe('integration test inventory', () => {
  it('accepts the compiled extension-host suite', () => {
    expect(() => validateIntegrationTestFiles(['out/test/integration/extension.test.js'])).not.toThrow();
  });

  it('rejects an empty compiled suite', () => {
    expect(() => validateIntegrationTestFiles([])).toThrow('Integration test inventory mismatch');
  });

  it('rejects live API tests from the extension-host harness', () => {
    expect(() =>
      validateIntegrationTestFiles([
        'out/test/integration/extension.test.js',
        'out/test/integration/liveApiSmoke.test.js',
      ]),
    ).toThrow('Integration test inventory mismatch');
  });
});
