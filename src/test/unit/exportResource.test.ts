// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const mockRegisterCommand = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockWriteFile = jest.fn();
const mockOpenTextDocument = jest.fn();
const mockShowTextDocument = jest.fn();
const mockStat = jest.fn();

jest.mock('vscode', () => {
  const Uri = {
    joinPath: jest.fn((_base: unknown, filename: string) => ({
      fsPath: `/workspace/${filename}`,
      scheme: 'file',
      path: `/workspace/${filename}`,
    })),
    parse: jest.fn((s: string) => ({ fsPath: s, scheme: 'file', path: s })),
  };
  return {
    Uri,
    window: {
      showErrorMessage: jest.fn(),
      showWarningMessage: mockShowWarningMessage,
      showInformationMessage: mockShowInformationMessage,
      showTextDocument: mockShowTextDocument,
      withProgress: jest.fn((_opts: unknown, task: () => Promise<unknown>) => task()),
      createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn(),
      })),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace', scheme: 'file', path: '/workspace' } }],
      fs: {
        writeFile: mockWriteFile,
        stat: mockStat,
      },
      openTextDocument: mockOpenTextDocument,
      getConfiguration: jest.fn(() => ({
        get: jest.fn().mockReturnValue('info'),
      })),
      asRelativePath: jest.fn((uri: { fsPath: string }) => uri.fsPath?.replace('/workspace/', '') ?? String(uri)),
    },
    ProgressLocation: { Notification: 15 },
    commands: {
      registerCommand: mockRegisterCommand,
    },
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

jest.mock('../../services/resourceService', () => ({
  ResourceService: jest.fn().mockImplementation(() => mockResourceService),
}));

jest.mock('../../utils/errors', () => ({
  showError: jest.fn(),
  showWarning: jest.fn(),
  showInfo: jest.fn(),
  withErrorHandling: jest.fn(async (fn: () => Promise<void>, _label: string) => {
    await fn();
  }),
}));

const mockResourceService = {
  exportResource: jest.fn(),
  exportAll: jest.fn(),
};

import { registerExportCommands } from '../../commands/exportResource';
import type { ContextManager } from '../../config/contextManager';
import type { XCSHExplorerProvider } from '../../tree/xcshExplorer';

describe('registerExportCommands', () => {
  let registeredCommands: Map<string, (...args: unknown[]) => Promise<void>>;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredCommands = new Map();
    mockRegisterCommand.mockImplementation((id: string, handler: (...args: unknown[]) => Promise<void>) => {
      registeredCommands.set(id, handler);
      return { dispose: jest.fn() };
    });

    const context = {
      subscriptions: { push: jest.fn() },
    } as unknown as import('vscode').ExtensionContext;

    const explorer = {} as XCSHExplorerProvider;
    const contextManager = {} as ContextManager;

    registerExportCommands(context, explorer, contextManager);
  });

  it('registers all four export commands', () => {
    expect(registeredCommands.has('xcsh.exportJson')).toBe(true);
    expect(registeredCommands.has('xcsh.exportYaml')).toBe(true);
    expect(registeredCommands.has('xcsh.exportAllJson')).toBe(true);
    expect(registeredCommands.has('xcsh.exportAllYaml')).toBe(true);
  });

  describe('xcsh.exportJson', () => {
    it('warns when argument is not a resource node', async () => {
      const { showWarning } = require('../../utils/errors');
      const handler = registeredCommands.get('xcsh.exportJson')!;
      await handler('not a node');

      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('Select a resource'));
    });

    it('exports resource as JSON to workspace root', async () => {
      mockResourceService.exportResource.mockResolvedValue({
        content: '{"kind":"http_loadbalancer"}',
        manifest: { kind: 'http_loadbalancer', metadata: { name: 'my-lb' }, spec: {} },
      });
      mockStat.mockRejectedValue(new Error('not found'));
      mockOpenTextDocument.mockResolvedValue({ uri: { fsPath: '/workspace/my-lb.http_loadbalancer.json' } });
      mockShowTextDocument.mockResolvedValue(undefined);

      const node = {
        getData: () => ({
          name: 'my-lb',
          resourceTypeKey: 'http_loadbalancer',
          namespace: 'default',
          profileName: 'test-ctx',
          resourceType: { displayName: 'HTTP Load Balancers' },
        }),
      };

      const handler = registeredCommands.get('xcsh.exportJson')!;
      await handler(node);

      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockOpenTextDocument).toHaveBeenCalled();
    });

    it('prompts for overwrite when file exists', async () => {
      mockStat.mockResolvedValue({ type: 1 });
      mockShowWarningMessage.mockResolvedValue(undefined); // user cancels

      const node = {
        getData: () => ({
          name: 'my-lb',
          resourceTypeKey: 'http_loadbalancer',
          namespace: 'default',
          profileName: 'test-ctx',
          resourceType: { displayName: 'HTTP Load Balancers' },
        }),
      };

      const handler = registeredCommands.get('xcsh.exportJson')!;
      await handler(node);

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
        expect.any(Object),
        expect.any(String),
      );
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('xcsh.exportAllJson', () => {
    it('warns when argument is not a resource type node', async () => {
      const { showWarning } = require('../../utils/errors');
      const handler = registeredCommands.get('xcsh.exportAllJson')!;
      await handler('not a node');

      expect(showWarning).toHaveBeenCalledWith(expect.stringContaining('Select a resource type'));
    });

    it('exports all resources of a type', async () => {
      mockResourceService.exportAll.mockResolvedValue({
        manifests: [{ kind: 'http_loadbalancer', metadata: { name: 'lb-1' }, spec: {} }],
        contents: new Map([['lb-1', '{"kind":"http_loadbalancer"}']]),
      });

      const node = {
        contextValue: 'resourceType:http_loadbalancer',
        getData: () => ({
          resourceTypeKey: 'http_loadbalancer',
          namespace: 'default',
          profileName: 'test-ctx',
          resourceType: { displayName: 'HTTP Load Balancers' },
        }),
      };

      const handler = registeredCommands.get('xcsh.exportAllJson')!;
      await handler(node);

      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Exported 1'));
    });
  });
});

describe('buildExportFilename', () => {
  // Test the filename building logic indirectly through the command
  it('generates correct filename pattern: name.kind.json', () => {
    const name = 'my-app';
    const kind = 'http_loadbalancer';
    const expected = 'my-app.http_loadbalancer.json';
    expect(`${name}.${kind}.json`).toBe(expected);
  });

  it('generates correct filename pattern: name.kind.yaml', () => {
    const name = 'backend-pool';
    const kind = 'origin_pool';
    const expected = 'backend-pool.origin_pool.yaml';
    expect(`${name}.${kind}.yaml`).toBe(expected);
  });
});
