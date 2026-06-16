// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { registerYamlSchemaContributor } from '../../providers/yamlSchemaContributor';

describe('yamlSchemaContributor', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      subscriptions: [],
      globalState: {
        get: jest.fn().mockReturnValue(false),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as vscode.ExtensionContext;
  });

  it('skips registration when YAML extension is not installed', async () => {
    jest.spyOn(vscode.extensions, 'getExtension').mockReturnValue(undefined);

    await registerYamlSchemaContributor(mockContext);
    // Should not throw
  });

  it('registers contributor when YAML extension is available', async () => {
    const mockRegister = jest.fn().mockReturnValue(true);
    const mockApi = { registerContributor: mockRegister };

    jest.spyOn(vscode.extensions, 'getExtension').mockReturnValue({
      activate: jest.fn().mockResolvedValue(mockApi),
      id: 'redhat.vscode-yaml',
      extensionUri: {} as vscode.Uri,
      extensionPath: '',
      isActive: false,
      packageJSON: {},
      extensionKind: vscode.ExtensionKind.Workspace,
      exports: undefined,
    });

    await registerYamlSchemaContributor(mockContext);

    expect(mockRegister).toHaveBeenCalledWith('f5xc', expect.any(Function), expect.any(Function));
  });

  it('handles YAML extension without registerContributor API', async () => {
    jest.spyOn(vscode.extensions, 'getExtension').mockReturnValue({
      activate: jest.fn().mockResolvedValue({}),
      id: 'redhat.vscode-yaml',
      extensionUri: {} as vscode.Uri,
      extensionPath: '',
      isActive: false,
      packageJSON: {},
      extensionKind: vscode.ExtensionKind.Workspace,
      exports: undefined,
    });

    await registerYamlSchemaContributor(mockContext);
    // Should not throw
  });

  it('handles YAML extension activation failure', async () => {
    jest.spyOn(vscode.extensions, 'getExtension').mockReturnValue({
      activate: jest.fn().mockRejectedValue(new Error('activation failed')),
      id: 'redhat.vscode-yaml',
      extensionUri: {} as vscode.Uri,
      extensionPath: '',
      isActive: false,
      packageJSON: {},
      extensionKind: vscode.ExtensionKind.Workspace,
      exports: undefined,
    });

    await registerYamlSchemaContributor(mockContext);
    // Should not throw
  });
});
