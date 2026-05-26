// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { HOST_TOOL_DEFINITIONS, handleHostToolCall, resetCachedCodeActionsForTest } from '../../xcsh/hostTools';
import type { RpcHostToolCall } from '../../xcsh/types';

function makeCall(toolName: string, args: Record<string, unknown> = {}): RpcHostToolCall {
  return {
    type: 'host_tool_call',
    id: 'test-id',
    toolCallId: 'tc-1',
    toolName,
    arguments: args,
  };
}

describe('hostTools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('HOST_TOOL_DEFINITIONS', () => {
    it('every definition has name, description, and parameters', () => {
      for (const def of HOST_TOOL_DEFINITIONS) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.parameters).toBeDefined();
      }
    });

    it('includes all 20 tool definitions', () => {
      expect(HOST_TOOL_DEFINITIONS.length).toBe(20);
    });
  });

  describe('vscode_get_document_symbols', () => {
    it('returns serialized symbols', async () => {
      const mockSymbols = [
        {
          name: 'MyClass',
          kind: 4,
          location: {
            uri: vscode.Uri.file('/a.ts'),
            range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(10, 0)),
          },
        },
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockSymbols);

      const result = await handleHostToolCall(makeCall('vscode_get_document_symbols', { path: '/a.ts' }));
      expect(result.isError).toBeUndefined();
      expect(result.result.data).toEqual([
        {
          name: 'MyClass',
          kind: 4,
          location: { path: '/a.ts', range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } } },
        },
      ]);
    });

    it('returns empty array when no symbols found', async () => {
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue([]);
      const result = await handleHostToolCall(makeCall('vscode_get_document_symbols', { path: '/a.ts' }));
      expect(result.result.data).toEqual([]);
    });

    it('handles hierarchical DocumentSymbol (no .location field)', async () => {
      const mockDocSymbols = [
        {
          name: 'MyClass',
          kind: 4,
          range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(20, 0)),
          selectionRange: new vscode.Range(new vscode.Position(0, 6), new vscode.Position(0, 13)),
          children: [
            {
              name: 'myMethod',
              kind: 5,
              range: new vscode.Range(new vscode.Position(2, 2), new vscode.Position(8, 2)),
              selectionRange: new vscode.Range(new vscode.Position(2, 2), new vscode.Position(2, 10)),
              children: [],
            },
          ],
        },
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockDocSymbols);

      const result = await handleHostToolCall(makeCall('vscode_get_document_symbols', { path: '/a.ts' }));
      expect(result.isError).toBeUndefined();
      const data = result.result.data as Array<{ name: string; kind: number; children?: unknown[] }>;
      expect(data).toHaveLength(1);
      expect(data[0]?.name).toBe('MyClass');
      expect(data[0]?.children).toHaveLength(1);
    });
  });

  describe('vscode_get_definitions', () => {
    it('returns serialized locations', async () => {
      const mockLocations = [
        new vscode.Location(
          vscode.Uri.file('/b.ts'),
          new vscode.Range(new vscode.Position(5, 2), new vscode.Position(5, 10)),
        ),
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockLocations);

      const result = await handleHostToolCall(
        makeCall('vscode_get_definitions', { path: '/a.ts', line: 3, character: 5 }),
      );
      expect(result.isError).toBeUndefined();
      const data = result.result.data as Array<{ path: string }>;
      expect(data).toHaveLength(1);
      expect(data[0]?.path).toBe('/b.ts');
    });

    it('handles LocationLink (targetUri/targetRange) from definition providers', async () => {
      const mockLinks = [
        {
          targetUri: vscode.Uri.file('/linked.ts'),
          targetRange: new vscode.Range(new vscode.Position(3, 0), new vscode.Position(3, 10)),
          targetSelectionRange: new vscode.Range(new vscode.Position(3, 0), new vscode.Position(3, 5)),
          originSelectionRange: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 5)),
        },
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockLinks);

      const result = await handleHostToolCall(
        makeCall('vscode_get_definitions', { path: '/a.ts', line: 1, character: 2 }),
      );
      expect(result.isError).toBeUndefined();
      const data = result.result.data as Array<{ path: string }>;
      expect(data).toHaveLength(1);
      expect(data[0]?.path).toBe('/linked.ts');
    });
  });

  describe('vscode_get_references', () => {
    it('returns serialized locations', async () => {
      const mockLocations = [
        new vscode.Location(
          vscode.Uri.file('/c.ts'),
          new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 5)),
        ),
        new vscode.Location(
          vscode.Uri.file('/d.ts'),
          new vscode.Range(new vscode.Position(7, 3), new vscode.Position(7, 8)),
        ),
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockLocations);

      const result = await handleHostToolCall(
        makeCall('vscode_get_references', { path: '/a.ts', line: 3, character: 5 }),
      );
      const data = result.result.data as unknown[];
      expect(data).toHaveLength(2);
    });
  });

  describe('vscode_get_hover', () => {
    it('returns hover markdown content', async () => {
      const mockHovers = [{ contents: [new vscode.MarkdownString('**type:** string')] }];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockHovers);

      const result = await handleHostToolCall(makeCall('vscode_get_hover', { path: '/a.ts', line: 3, character: 5 }));
      expect(result.isError).toBeUndefined();
      const data = result.result.data as string[];
      expect(data[0]).toContain('string');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool', async () => {
      const result = await handleHostToolCall(makeCall('vscode_nonexistent'));
      expect(result.isError).toBe(true);
    });
  });

  describe('vscode_get_workspace_symbols', () => {
    it('returns serialized workspace symbols', async () => {
      const mockSymbols = [
        {
          name: 'MyFunction',
          kind: 11,
          containerName: 'module',
          location: new vscode.Location(
            vscode.Uri.file('/src/mod.ts'),
            new vscode.Range(new vscode.Position(3, 0), new vscode.Position(3, 15)),
          ),
        },
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockSymbols);

      const result = await handleHostToolCall(makeCall('vscode_get_workspace_symbols', { query: 'MyFunc' }));
      expect(result.isError).toBeUndefined();
      const data = result.result.data as Array<{ name: string; containerName: string }>;
      expect(data).toHaveLength(1);
      expect(data[0]?.name).toBe('MyFunction');
      expect(data[0]?.containerName).toBe('module');
    });
  });

  describe('vscode_get_code_actions', () => {
    it('returns available code actions', async () => {
      const mockActions = [
        { title: 'Extract to function', kind: { value: 'refactor.extract' }, isPreferred: false },
        { title: 'Add missing import', kind: { value: 'quickfix' }, isPreferred: true },
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockActions);

      const result = await handleHostToolCall(
        makeCall('vscode_get_code_actions', { path: '/a.ts', line: 5, character: 0 }),
      );
      expect(result.isError).toBeUndefined();
      const data = result.result.data as Array<{ title: string; index: number }>;
      expect(data).toHaveLength(2);
      expect(data[0]?.title).toBe('Extract to function');
      expect(data[0]?.index).toBe(0);
      expect(data[1]?.title).toBe('Add missing import');
      expect(data[1]?.index).toBe(1);
    });
  });

  describe('vscode_execute_code_action', () => {
    beforeEach(() => {
      resetCachedCodeActionsForTest();
    });

    it('returns error when no cached actions', async () => {
      const result = await handleHostToolCall(makeCall('vscode_execute_code_action', { actionIndex: 0 }));
      expect(result.isError).toBe(true);
    });
  });

  describe('vscode_apply_workspace_edit', () => {
    it('applies edits and returns success', async () => {
      (vscode.workspace.applyEdit as jest.Mock).mockResolvedValue(true);

      const result = await handleHostToolCall(
        makeCall('vscode_apply_workspace_edit', {
          edits: [{ path: '/a.ts', range: { startLine: 0, startChar: 0, endLine: 0, endChar: 5 }, newText: 'hello' }],
        }),
      );
      expect(result.isError).toBeUndefined();
      expect(result.result.data).toEqual({ applied: true });
    });
  });

  describe('vscode_format_document', () => {
    it('applies formatting edits', async () => {
      const mockEdits = [
        { range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 2)), newText: '  ' },
      ];
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(mockEdits);
      (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
        uri: vscode.Uri.file('/a.ts'),
      });
      (vscode.workspace.applyEdit as jest.Mock).mockResolvedValue(true);

      const result = await handleHostToolCall(makeCall('vscode_format_document', { path: '/a.ts' }));
      expect(result.isError).toBeUndefined();
    });
  });

  describe('vscode_get_editor_state', () => {
    it('returns full editor snapshot', async () => {
      const mockEditor = {
        document: {
          uri: vscode.Uri.file('/active.ts'),
          languageId: 'typescript',
        },
        selection: {
          start: new vscode.Position(10, 5),
          end: new vscode.Position(10, 15),
          active: new vscode.Position(10, 15),
        },
        selections: [{ start: new vscode.Position(10, 5), end: new vscode.Position(10, 15) }],
      };
      (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = mockEditor;
      (vscode.window.visibleTextEditors as unknown[]) = [mockEditor];
      (vscode.workspace.workspaceFolders as unknown[]) = [{ uri: vscode.Uri.file('/workspace') }];
      (vscode.languages.getDiagnostics as jest.Mock).mockReturnValue([
        { severity: 0 },
        { severity: 0 },
        { severity: 1 },
      ]);

      const result = await handleHostToolCall(makeCall('vscode_get_editor_state'));
      expect(result.isError).toBeUndefined();
      const data = result.result.data as {
        activeFile: string;
        language: string;
        diagnosticSummary: { errors: number; warnings: number };
      };
      expect(data.activeFile).toBe('/active.ts');
      expect(data.language).toBe('typescript');
      expect(data.diagnosticSummary.errors).toBe(2);
      expect(data.diagnosticSummary.warnings).toBe(1);
    });

    it('returns empty state when no active editor', async () => {
      (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = undefined;

      const result = await handleHostToolCall(makeCall('vscode_get_editor_state'));
      expect(result.isError).toBeUndefined();
      const data = result.result.data as { activeFile: null };
      expect(data.activeFile).toBeNull();
    });
  });

  describe('vscode_save_document', () => {
    it('saves the document', async () => {
      const mockDoc = { save: jest.fn().mockResolvedValue(true) };
      (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(mockDoc);

      const result = await handleHostToolCall(makeCall('vscode_save_document', { path: '/a.ts' }));
      expect(result.isError).toBeUndefined();
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });

  describe('vscode_check_dirty', () => {
    it('returns dirty state', async () => {
      const mockDoc = { isDirty: true };
      (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(mockDoc);

      const result = await handleHostToolCall(makeCall('vscode_check_dirty', { path: '/a.ts' }));
      expect(result.isError).toBeUndefined();
      expect(result.result.data).toEqual({ isDirty: true });
    });
  });

  describe('vscode_show_notification', () => {
    it('shows info notification by default', async () => {
      const result = await handleHostToolCall(makeCall('vscode_show_notification', { message: 'Hello' }));
      expect(result.isError).toBeUndefined();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Hello');
    });

    it('shows warning notification', async () => {
      const result = await handleHostToolCall(
        makeCall('vscode_show_notification', { message: 'Warn', severity: 'warning' }),
      );
      expect(result.isError).toBeUndefined();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Warn');
    });

    it('shows error notification', async () => {
      const result = await handleHostToolCall(
        makeCall('vscode_show_notification', { message: 'Err', severity: 'error' }),
      );
      expect(result.isError).toBeUndefined();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Err');
    });
  });
});
