// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { F5Core, getCapabilities, negotiateCapabilities } from '@f5-sales-demo/xcsh-f5-core';
import * as vscode from 'vscode';
import { probeOptionalF5Cli } from '../../xcsh/nativeCliCapabilities';
import type { NativeContextHost } from '../../xcsh/nativeContextHost';
import { bundledNativeF5Options } from '../../xcsh/nativeCorePackage';

jest.mock('@f5-sales-demo/xcsh-f5-core', () => ({
  F5Core: jest.fn(),
  getCapabilities: jest.fn(),
  negotiateCapabilities: jest.fn(),
}));
jest.mock('../../xcsh/nativeCliCapabilities', () => ({ probeOptionalF5Cli: jest.fn() }));

const expectedHash = '3f62329f0e12ecae1789d5579ba513c31589e3ac44e0bcf74d8a14e9720692e3';
let root: string;
let context: vscode.ExtensionContext;
beforeEach(async () => {
  jest.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), 'xcsh-bundled-core-'));
  await mkdir(join(root, 'resources', 'agents'), { recursive: true });
  await writeFile(
    join(root, 'resources', 'agents', 'xcsh.agent.md'),
    "---\nname: xcsh\ntools: ['xcshF5']\n---\nUse xcshF5.\n",
  );
  context = { extensionUri: vscode.Uri.file(root) } as vscode.ExtensionContext;
  jest.mocked(getCapabilities).mockReturnValue({
    protocol: 'xcsh-f5-core',
    version: 1,
    specificationVersion: '12.5.1',
    specificationHash: expectedHash,
    capabilities: ['discovery'],
  });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('uses the released core constructor and packaged instructions without accessing contexts', () => {
  const options = bundledNativeF5Options(context);
  expect(options.agentDocument).toContain('Use xcshF5.');
  expect(F5Core).not.toHaveBeenCalled();
  const host = {} as NativeContextHost;
  options.createCore(host);
  expect(F5Core).toHaveBeenCalledWith(host);
});

it.each(['protocol', 'version', 'specificationHash', 'specificationVersion'])(
  'rejects an unexpected package %s before exposing its factory',
  (field) => {
    jest.mocked(getCapabilities).mockReturnValue({ ...getCapabilities(), [field]: 'unexpected' });
    expect(() => bundledNativeF5Options(context)).toThrow('F5_CORE_PACKAGE_UNSUPPORTED');
    expect(F5Core).not.toHaveBeenCalled();
  },
);

it('queries CLI enhancements through the released capability negotiator', async () => {
  jest
    .mocked(probeOptionalF5Cli)
    .mockResolvedValue({ state: 'unavailable', negotiation: negotiateCapabilities(undefined) });
  const options = bundledNativeF5Options(context);
  expect(await options.probeCli?.('configured-cli')).toBe('unavailable');
  expect(probeOptionalF5Cli).toHaveBeenCalledWith('configured-cli', negotiateCapabilities, { timeoutMs: 2000 });
  expect(F5Core).not.toHaveBeenCalled();
});
