// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../../config/contextTypes';
import { bundledNativeF5Options } from '../../xcsh/nativeCorePackage';
import { type NativeF5Input, NativeF5Tool } from '../../xcsh/nativeF5Tools';

describe('published core through the production native adapter', () => {
  let root: string;
  let active: boolean;
  let tool: NativeF5Tool;
  let network: jest.SpyInstance;
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => new vscode.Disposable(() => {}),
  } as vscode.CancellationToken;
  const manifest = {
    kind: 'http_loadbalancer',
    metadata: { name: 'published-core-test', namespace: 'default' },
    spec: { domains: ['example.invalid'], routes: [], origin_pools: [] },
  };
  const invoke = async (input: NativeF5Input) => {
    const result = await tool.invoke({ input, toolInvocationToken: undefined }, token);
    const text = result.content[0];
    if (!(text instanceof vscode.LanguageModelTextPart)) {
      throw new Error('UNEXPECTED_TOOL_RESULT');
    }
    return text.value;
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'xcsh-published-core-'));
    active = true;
    network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
    // Node's structuredClone returns outer-realm objects under Jest's VM. Keep
    // these JSON fixtures in the core's realm so its plain-object guard applies.
    jest.spyOn(globalThis, 'structuredClone').mockImplementation((value) => JSON.parse(JSON.stringify(value)));
    const manager = {
      isSessionActivated: () => active,
      onDidChangeContext: () => new vscode.Disposable(() => {}),
      resolveContext: () =>
        Promise.resolve({
          source: 'global',
          sourcePath: join(root, 'context.json'),
          context: {
            name: 'synthetic',
            apiUrl: 'https://example.invalid',
            apiToken: 'synthetic-credential',
            defaultNamespace: 'default',
          },
        }),
    } as unknown as ContextManagerInterface;
    const options = bundledNativeF5Options({
      extensionUri: vscode.Uri.file(resolve(__dirname, '../../..')),
    } as vscode.ExtensionContext);
    tool = new NativeF5Tool(manager, () => root, join(root, 'receipts'), options.createCore);
  });

  afterEach(() => {
    tool?.dispose();
    expect(network).not.toHaveBeenCalled();
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('validates actual bundled constraints without a CLI or network', async () => {
    const valid = await invoke({ action: 'validate', objects: [manifest] });
    expect(valid).toContain('"valid":true');
    const invalid = await invoke({
      action: 'validate',
      objects: [{ ...manifest, spec: { ...manifest.spec, more_option: { custom_errors: { '200': '/error.html' } } } }],
    });
    expect(invalid).toContain('INVALID_MAP');
    expect(invalid).not.toContain('synthetic-credential');
  });

  it('describes the actual published specification through native tool output', async () => {
    const result = await invoke({
      action: 'describe',
      kind: 'http_loadbalancer',
      field: 'spec.more_option.custom_errors',
    });
    expect(result).toContain('constraintType');
    expect(result).toContain('map');
  });

  it('retains the Contexts activation gate with the actual core', async () => {
    active = false;
    await expect(invoke({ action: 'discover' })).rejects.toThrow('NO_ACTIVE_CONTEXT');
  });

  it('keeps bundled operations usable after optional CLI failure', async () => {
    const options = bundledNativeF5Options({
      extensionUri: vscode.Uri.file(resolve(__dirname, '../../..')),
    } as vscode.ExtensionContext);
    expect(await options.probeCli?.(join(root, 'missing-cli'))).toBe('unavailable');
    expect(await invoke({ action: 'validate', objects: [manifest] })).toContain('"valid":true');
  });
});
