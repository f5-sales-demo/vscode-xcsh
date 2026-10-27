// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../../config/contextTypes';
import { activateXcsh } from '../../xcsh/index';
import { registerLiteLLMProvider } from '../../xcsh/litellmProvider';
import { bundledNativeF5Options } from '../../xcsh/nativeCorePackage';
import { type NativeF5ChatRegistration, registerNativeF5Chat } from '../../xcsh/nativeF5Activation';
import { XcshProcessManager } from '../../xcsh/processManager';
import { registerTerminalIntegration } from '../../xcsh/terminalIntegration';

jest.mock('../../xcsh/nativeF5Activation', () => ({ registerNativeF5Chat: jest.fn() }));
jest.mock('../../xcsh/litellmProvider', () => ({ registerLiteLLMProvider: jest.fn() }));
jest.mock('../../xcsh/processManager', () => ({ XcshProcessManager: jest.fn() }));
jest.mock('../../xcsh/terminalIntegration', () => ({ registerTerminalIntegration: jest.fn() }));
jest.mock('../../xcsh/nativeCorePackage', () => ({ bundledNativeF5Options: jest.fn() }));
jest.mock('../../utils/logger', () => ({ getLogger: () => ({ info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (_key: string, fallback: unknown) => fallback,
  } as vscode.WorkspaceConfiguration);
  jest.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  jest.mocked(registerLiteLLMProvider).mockReturnValue(false);
  jest.mocked(registerNativeF5Chat).mockResolvedValue({ ready: true, disposed: false } as NativeF5ChatRegistration);
});
afterEach(() => jest.restoreAllMocks());

const context = () => ({ subscriptions: [] }) as unknown as vscode.ExtensionContext;
const manager = () => ({ resolveContext: jest.fn() }) as unknown as ContextManagerInterface;
const options = () => ({ createCore: jest.fn(), agentDocument: 'Packaged instructions' });

it('activates native operations without starting a CLI agent or resolving contexts for a subprocess', async () => {
  const contexts = manager();
  const native = options();
  await activateXcsh(context(), contexts, native);
  expect(registerNativeF5Chat).toHaveBeenCalledWith(expect.any(Object), contexts, expect.objectContaining(native));
  expect(XcshProcessManager).not.toHaveBeenCalled();
  expect(registerTerminalIntegration).toHaveBeenCalled();
  expect(vscode.commands.executeCommand).toHaveBeenCalledWith('setContext', 'xcsh.usesNativeChat', true);
});

it('keeps failed native candidates gated instead of falling through to the CLI agent', async () => {
  jest.mocked(registerNativeF5Chat).mockResolvedValue({ ready: false, disposed: false } as NativeF5ChatRegistration);
  await activateXcsh(context(), manager(), options());
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('rejects CLI session controls explicitly on native hosts without launching a process', async () => {
  await activateXcsh(context(), manager(), options());
  for (const command of ['xcsh.xcsh.pairHerdr', 'xcsh.xcsh.disconnectHerdr', 'xcsh.xcsh.restart']) {
    const handler = jest.mocked(vscode.commands.registerCommand).mock.calls.find(([id]) => id === command)?.[1];
    expect(handler).toBeDefined();
    expect(handler?.()).toBe(false);
  }
  expect(vscode.window.showInputBox).not.toHaveBeenCalled();
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('keeps Kiro gated without starting a CLI chat loop', async () => {
  jest.replaceProperty(vscode.env, 'appName', 'Kiro');
  await activateXcsh(context(), manager(), options());
  expect(registerNativeF5Chat).not.toHaveBeenCalled();
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('does not continue native activation disposed during startup', async () => {
  jest.mocked(registerNativeF5Chat).mockResolvedValue({ ready: false, disposed: true } as NativeF5ChatRegistration);
  await activateXcsh(context(), manager(), options());
  expect(XcshProcessManager).not.toHaveBeenCalled();
  expect(registerTerminalIntegration).not.toHaveBeenCalled();
});

it('keeps bundled activation independent of a failed gateway provider registration', async () => {
  jest.mocked(registerLiteLLMProvider).mockImplementationOnce(() => {
    throw new Error('Gateway registration conflict');
  });
  await expect(activateXcsh(context(), manager(), options())).resolves.toBeUndefined();
  expect(registerNativeF5Chat).toHaveBeenCalled();
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('keeps native activation usable when the optional capability query fails', async () => {
  const probeCli = jest.fn().mockRejectedValue(new Error('Synthetic CLI failure'));
  await expect(activateXcsh(context(), manager(), { ...options(), probeCli })).resolves.toBeUndefined();
  expect(probeCli).toHaveBeenCalledWith('xcsh');
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('does not probe an optional executable for an unavailable native workspace', async () => {
  jest.mocked(registerNativeF5Chat).mockResolvedValue({ ready: false, disposed: false } as NativeF5ChatRegistration);
  const probeCli = jest.fn();
  await activateXcsh(context(), manager(), { ...options(), probeCli });
  expect(probeCli).not.toHaveBeenCalled();
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('uses the bundled package factory for normal extension activation', async () => {
  const native = options();
  jest.mocked(bundledNativeF5Options).mockReturnValue(native);
  await activateXcsh(context(), manager());
  expect(bundledNativeF5Options).toHaveBeenCalled();
  expect(registerNativeF5Chat).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(Object),
    expect.objectContaining(native),
  );
  expect(XcshProcessManager).not.toHaveBeenCalled();
});

it('keeps unsupported package activation gated without a CLI fallback', async () => {
  jest.mocked(bundledNativeF5Options).mockImplementationOnce(() => {
    throw new Error('F5_CORE_PACKAGE_UNSUPPORTED');
  });
  await expect(activateXcsh(context(), manager())).resolves.toBeUndefined();
  expect(registerNativeF5Chat).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(Object),
    expect.objectContaining({ agentDocument: '' }),
  );
  expect(XcshProcessManager).not.toHaveBeenCalled();
});
