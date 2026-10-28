// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { F5Core, getCapabilities, negotiateCapabilities } from '@f5-sales-demo/xcsh-f5-core';
import type * as vscode from 'vscode';
import { probeOptionalF5Cli } from './nativeCliCapabilities';
import type { NativeF5ChatOptions } from './nativeF5Activation';

const specificationHash = '3f62329f0e12ecae1789d5579ba513c31589e3ac44e0bcf74d8a14e9720692e3';

/** The dependency pin and this receipt qualify the exact bundled specification. */
export function bundledNativeF5Options(context: vscode.ExtensionContext): NativeF5ChatOptions {
  const capabilities = getCapabilities();
  if (
    capabilities.protocol !== 'xcsh-f5-core' ||
    capabilities.version !== 1 ||
    capabilities.specificationVersion !== '12.5.1' ||
    capabilities.specificationHash !== specificationHash
  ) {
    throw new Error('F5_CORE_PACKAGE_UNSUPPORTED');
  }
  const agentDocument = readFileSync(join(context.extensionUri.fsPath, 'resources', 'agents', 'xcsh.agent.md'), 'utf8');
  return {
    agentDocument,
    createCore: (host) => new F5Core(host),
    probeCli: async (executable) =>
      (await probeOptionalF5Cli(executable, negotiateCapabilities, { timeoutMs: 2000 })).state,
  };
}
