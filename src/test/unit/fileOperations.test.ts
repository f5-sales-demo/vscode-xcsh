// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const mockRegisterCommand = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockExecuteCommand = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockApplyEdit = jest.fn();

jest.mock('vscode', () => {
  class Uri {
    fsPath: string;
    scheme: string;
    path: string;
    constructor(fsPath: string) {
      this.fsPath = fsPath;
      this.scheme = 'file';
      this.path = fsPath;
    }
    static joinPath = jest.fn();
    static parse = jest.fn((s: string) => new Uri(s));
  }
  return {
    Uri,
    Position: jest.fn((line: number, char: number) => ({ line, character: char })),
    WorkspaceEdit: jest.fn(() => ({ insert: jest.fn() })),
    window: {
      activeTextEditor: undefined,
      showErrorMessage: jest.fn(),
      showWarningMessage: mockShowWarningMessage,
      showInformationMessage: mockShowInformationMessage,
      showTextDocument: jest.fn(),
      withProgress: jest.fn((_opts: unknown, task: () => Promise<unknown>) => task()),
      createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn(),
      })),
    },
    workspace: {
      openTextDocument: mockOpenTextDocument,
      applyEdit: mockApplyEdit,
      asRelativePath: jest.fn((uri: { fsPath?: string }) => uri?.fsPath ?? String(uri)),
      getConfiguration: jest.fn(() => ({
        get: jest.fn().mockReturnValue('info'),
      })),
    },
    commands: {
      registerCommand: mockRegisterCommand,
      executeCommand: mockExecuteCommand,
    },
    ProgressLocation: { Notification: 15 },
    l10n: {
      t: jest.fn((...args: unknown[]) => {
        let result = String(args[0]);
        for (let i = 1; i < args.length; i++) {
          result = result.replace(`{${i - 1}}`, String(args[i]));
        }
        return result;
      }),
    },
  };
});

const mockResourceService = {
  applyManifest: jest.fn(),
  createManifest: jest.fn(),
  diffManifest: jest.fn(),
  deleteFromManifest: jest.fn(),
  formatDiff: jest.fn().mockReturnValue('diff text'),
};

jest.mock('../../services/resourceService', () => ({
  ResourceService: jest.fn().mockImplementation(() => mockResourceService),
}));

jest.mock('../../utils/errors', () => ({
  XCSHApiError: class extends Error {
    statusCode: number;
    body: string;
    constructor(statusCode: number, body: string) {
      super(`API Error ${statusCode}: ${body}`);
      this.statusCode = statusCode;
      this.body = body;
    }
  },
  showError: jest.fn(),
  showWarning: jest.fn(),
  showInfo: jest.fn(),
  withErrorHandling: jest.fn(async (fn: () => Promise<void>, _label: string) => {
    await fn();
  }),
}));

jest.mock('../../utils/manifestDetector', () => ({
  isXCManifest: jest.fn((content: string) => {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return typeof parsed.kind === 'string' && parsed.kind === 'http_loadbalancer';
    } catch {
      return false;
    }
  }),
  getManifestKind: jest.fn((content: string) => {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return parsed.kind as string | undefined;
    } catch {
      return undefined;
    }
  }),
}));

import * as vscode from 'vscode';
import { registerFileOperationCommands } from '../../commands/fileOperations';
import type { ContextManager } from '../../config/contextManager';
import type { XCSHExplorerProvider } from '../../tree/xcshExplorer';

const validManifestContent = JSON.stringify({
  kind: 'http_loadbalancer',
  metadata: { name: 'my-lb' },
  spec: { domains: ['example.com'] },
});

function makeMockContextManager(): ContextManager {
  return {
    getActiveContext: jest.fn().mockResolvedValue({
      name: 'test-ctx',
      apiUrl: 'https://test.xcsh.dev/api',
      defaultNamespace: 'default',
    }),
    getContext: jest.fn().mockResolvedValue({
      name: 'test-ctx',
    }),
    getClient: jest.fn().mockResolvedValue({}),
  } as unknown as ContextManager;
}

describe('registerFileOperationCommands', () => {
  let registeredCommands: Map<string, (...args: unknown[]) => Promise<void>>;
  let mockExplorer: XCSHExplorerProvider;
  let mockContextManager: ContextManager;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredCommands = new Map();
    mockRegisterCommand.mockImplementation((id: string, handler: (...args: unknown[]) => Promise<void>) => {
      registeredCommands.set(id, handler);
      return { dispose: jest.fn() };
    });

    mockExplorer = { refresh: jest.fn() } as unknown as XCSHExplorerProvider;
    mockContextManager = makeMockContextManager();

    const context = {
      subscriptions: { push: jest.fn() },
    } as unknown as vscode.ExtensionContext;

    registerFileOperationCommands(context, mockExplorer, mockContextManager);
  });

  it('registers all four file operation commands', () => {
    expect(registeredCommands.has('xcsh.fileApply')).toBe(true);
    expect(registeredCommands.has('xcsh.fileCreate')).toBe(true);
    expect(registeredCommands.has('xcsh.fileDiff')).toBe(true);
    expect(registeredCommands.has('xcsh.fileDelete')).toBe(true);
  });

  describe('xcsh.fileApply', () => {
    it('warns when no file is selected or open', async () => {
      const { showWarning } = require('../../utils/errors');
      const handler = registeredCommands.get('xcsh.fileApply')!;
      // No URI arg, no active editor
      (vscode.window as Record<string, unknown>).activeTextEditor = undefined;
      await handler(undefined);

      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('No file selected'));
    });

    it('warns when file is not a valid manifest', async () => {
      const { showWarning } = require('../../utils/errors');
      mockOpenTextDocument.mockResolvedValue({
        getText: () => '{"notAManifest": true}',
      });

      const uri = { fsPath: '/workspace/test.json', scheme: 'file' };
      Object.setPrototypeOf(uri, (vscode.Uri as unknown as { prototype: object }).prototype ?? {});

      // Need to make instanceof check work — use active editor instead
      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => '{"notAManifest": true}',
          uri: { fsPath: '/workspace/test.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileApply')!;
      await handler(undefined);

      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('not a valid XC manifest'));
    });

    it('warns when no active context', async () => {
      const { showWarning } = require('../../utils/errors');
      (mockContextManager.getActiveContext as jest.Mock).mockResolvedValue(null);

      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => validManifestContent,
          uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileApply')!;
      await handler(undefined);

      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('No active context'));
    });

    it('applies manifest and shows success on create', async () => {
      mockShowInformationMessage.mockResolvedValue('Apply');
      mockResourceService.applyManifest.mockResolvedValue({
        status: 'created',
        resource: {},
        durationMs: 100,
      });

      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => validManifestContent,
          uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileApply')!;
      await handler(undefined);

      expect(mockResourceService.applyManifest).toHaveBeenCalledWith('test-ctx', validManifestContent);
      expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('created'));
      expect((mockExplorer as unknown as Record<string, jest.Mock>).refresh).toHaveBeenCalled();
    });

    it('shows error when apply fails', async () => {
      const { showWarning } = require('../../utils/errors');
      mockShowInformationMessage.mockResolvedValue('Apply');
      mockResourceService.applyManifest.mockResolvedValue({
        status: 'error',
        error: { kind: 'api', message: 'Server error' },
      });

      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => validManifestContent,
          uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileApply')!;
      await handler(undefined);

      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('Server error'));
    });
  });

  describe('xcsh.fileDiff', () => {
    it('shows message when resource is new', async () => {
      mockShowInformationMessage.mockResolvedValue(undefined);
      mockResourceService.diffManifest.mockResolvedValue({ isNew: true });

      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => validManifestContent,
          uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileDiff')!;
      await handler(undefined);

      expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('not found remotely'));
    });
  });

  describe('xcsh.fileDelete', () => {
    it('deletes resource and refreshes explorer', async () => {
      mockShowWarningMessage.mockResolvedValue('Delete');
      mockResourceService.deleteFromManifest.mockResolvedValue({
        status: 'deleted',
        name: 'my-lb',
        kind: 'http_loadbalancer',
        durationMs: 30,
      });

      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => validManifestContent,
          uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileDelete')!;
      await handler(undefined);

      expect(mockResourceService.deleteFromManifest).toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('deleted'));
      expect((mockExplorer as unknown as Record<string, jest.Mock>).refresh).toHaveBeenCalled();
    });

    it('does not delete when user cancels', async () => {
      mockShowWarningMessage.mockResolvedValue(undefined); // user cancels

      (vscode.window as Record<string, unknown>).activeTextEditor = {
        document: {
          getText: () => validManifestContent,
          uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' },
        },
      };

      const handler = registeredCommands.get('xcsh.fileDelete')!;
      await handler(undefined);

      expect(mockResourceService.deleteFromManifest).not.toHaveBeenCalled();
    });
  });
});
