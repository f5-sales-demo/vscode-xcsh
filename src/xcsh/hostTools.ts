// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { RpcHostToolCall, RpcHostToolDefinition, RpcHostToolResult } from './types';

const logger = getLogger();

let cachedCodeActions: vscode.CodeAction[] = [];

/** Exposed for testing only — resets the code-action cache between test cases. */
export function resetCachedCodeActionsForTest(): void {
  cachedCodeActions = [];
}

/**
 * Host tool definitions exposed to xcsh's agent for calling back into
 * the VS Code editor context.
 */
export const HOST_TOOL_DEFINITIONS: RpcHostToolDefinition[] = [
  {
    name: 'vscode_read_file',
    label: 'Read File',
    description: 'Read the contents of a file open in the VS Code workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or workspace-relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vscode_get_selection',
    label: 'Get Selection',
    description: 'Get the currently selected text in the active editor.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'vscode_get_diagnostics',
    label: 'Get Diagnostics',
    description: 'Get diagnostics (errors, warnings) for a file from VS Code.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or workspace-relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vscode_open_file',
    label: 'Open File',
    description: 'Open a file in the VS Code editor.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or workspace-relative file path' },
        line: { type: 'number', description: 'Optional line number to reveal' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vscode_get_document_symbols',
    label: 'Get Document Symbols',
    description: 'List all symbols (functions, classes, variables) in a file.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute or workspace-relative file path' } },
      required: ['path'],
    },
  },
  {
    name: 'vscode_get_definitions',
    label: 'Get Definitions',
    description: 'Go to definition for the symbol at a given position.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_get_type_definitions',
    label: 'Get Type Definitions',
    description: 'Go to type definition for the symbol at a given position.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_get_implementations',
    label: 'Get Implementations',
    description: 'Find implementations of an interface or abstract method.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_get_declarations',
    label: 'Get Declarations',
    description: 'Find declarations for the symbol at a given position.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_get_references',
    label: 'Get References',
    description: 'Find all references to the symbol at a given position.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_get_hover',
    label: 'Get Hover',
    description: 'Get hover documentation and type info for the symbol at a given position.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_get_workspace_symbols',
    label: 'Get Workspace Symbols',
    description: 'Search for symbols across the entire workspace.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Symbol search query' } },
      required: ['query'],
    },
  },
  {
    name: 'vscode_get_code_actions',
    label: 'Get Code Actions',
    description: 'Get available code actions (quick fixes, refactorings) at a position.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: '0-based line number' },
        character: { type: 'number', description: '0-based character offset' },
      },
      required: ['path', 'line', 'character'],
    },
  },
  {
    name: 'vscode_execute_code_action',
    label: 'Execute Code Action',
    description: 'Execute a code action by index from the last vscode_get_code_actions result.',
    parameters: {
      type: 'object',
      properties: {
        actionIndex: { type: 'number', description: 'Index of the action from the last get_code_actions result' },
      },
      required: ['actionIndex'],
    },
  },
  {
    name: 'vscode_apply_workspace_edit',
    label: 'Apply Workspace Edit',
    description: 'Apply a multi-file workspace edit with text replacements.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Array of edits to apply',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              range: {
                type: 'object',
                properties: {
                  startLine: { type: 'number' },
                  startChar: { type: 'number' },
                  endLine: { type: 'number' },
                  endChar: { type: 'number' },
                },
              },
              newText: { type: 'string' },
            },
          },
        },
      },
      required: ['edits'],
    },
  },
  {
    name: 'vscode_format_document',
    label: 'Format Document',
    description: 'Format an entire document using the active formatter.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path to format' } },
      required: ['path'],
    },
  },
  {
    name: 'vscode_get_editor_state',
    label: 'Get Editor State',
    description:
      'Get a full snapshot of the editor: active file, cursor, selections, open editors, workspace folders, and diagnostic summary.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'vscode_save_document',
    label: 'Save Document',
    description: 'Save a file in the VS Code editor.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path to save' } },
      required: ['path'],
    },
  },
  {
    name: 'vscode_check_dirty',
    label: 'Check Dirty',
    description: 'Check if a file has unsaved changes.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path to check' } },
      required: ['path'],
    },
  },
  {
    name: 'vscode_show_notification',
    label: 'Show Notification',
    description: 'Show a notification message in VS Code.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Notification message text' },
        severity: { type: 'string', description: 'Severity: "info" (default), "warning", or "error"' },
      },
      required: ['message'],
    },
  },
];

interface SerializedLocation {
  path: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

function serializeLocation(loc: vscode.Location): SerializedLocation {
  return {
    path: loc.uri.fsPath,
    range: {
      start: { line: loc.range.start.line, character: loc.range.start.character },
      end: { line: loc.range.end.line, character: loc.range.end.character },
    },
  };
}

function serializeLocationOrLink(item: unknown): SerializedLocation {
  const obj = item as Record<string, unknown>;
  if ('targetUri' in obj && 'targetRange' in obj) {
    const uri = obj.targetUri as { fsPath: string };
    const range = obj.targetRange as vscode.Range;
    return {
      path: uri.fsPath,
      range: {
        start: { line: range.start.line, character: range.start.character },
        end: { line: range.end.line, character: range.end.character },
      },
    };
  }
  return serializeLocation(item as vscode.Location);
}

function serializeSymbol(s: unknown): {
  name: string;
  kind: number;
  range?: SerializedLocation;
  location?: SerializedLocation;
  children?: unknown[];
} {
  const obj = s as Record<string, unknown>;
  if ('location' in obj) {
    const si = s as vscode.SymbolInformation;
    return { name: si.name, kind: si.kind, location: serializeLocation(si.location) };
  }
  const ds = s as {
    name: string;
    kind: number;
    range: vscode.Range;
    selectionRange: vscode.Range;
    children?: unknown[];
  };
  return {
    name: ds.name,
    kind: ds.kind,
    range: {
      path: '',
      range: {
        start: { line: ds.range.start.line, character: ds.range.start.character },
        end: { line: ds.range.end.line, character: ds.range.end.character },
      },
    },
    children: ds.children ? ds.children.map(serializeSymbol) : undefined,
  };
}

async function executeLocationProvider(
  command: string,
  filePath: string,
  line: number,
  character: number,
): Promise<SerializedLocation[]> {
  const uri = vscode.Uri.file(filePath);
  const position = new vscode.Position(line, character);
  const results = await vscode.commands.executeCommand<unknown[]>(command, uri, position);
  if (!results || results.length === 0) {
    return [];
  }
  return results.map(serializeLocationOrLink);
}

/**
 * Handle an incoming host tool call from xcsh and return the result.
 */
export async function handleHostToolCall(call: RpcHostToolCall): Promise<RpcHostToolResult> {
  const { toolName, id } = call;
  const args = call.arguments;

  try {
    switch (toolName) {
      case 'vscode_read_file': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const content = await vscode.workspace.fs.readFile(uri);
        return makeResult(id, new TextDecoder().decode(content));
      }

      case 'vscode_get_selection': {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return makeResult(id, '');
        }
        const selection = editor.document.getText(editor.selection);
        return makeResult(id, selection);
      }

      case 'vscode_get_diagnostics': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const diagnostics = vscode.languages.getDiagnostics(uri);
        const mapped = diagnostics.map((d) => ({
          range: {
            start: { line: d.range.start.line, character: d.range.start.character },
            end: { line: d.range.end.line, character: d.range.end.character },
          },
          message: d.message,
          severity: d.severity,
          source: d.source,
        }));
        return makeResult(id, mapped);
      }

      case 'vscode_open_file': {
        const filePath = args.path as string;
        const line = args.line as number | undefined;
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);

        const options: vscode.TextDocumentShowOptions = {};
        if (line !== undefined) {
          const position = new vscode.Position(line, 0);
          options.selection = new vscode.Range(position, position);
        }

        await vscode.window.showTextDocument(doc, options);
        return makeResult(id, { opened: filePath });
      }

      case 'vscode_get_document_symbols': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const symbols = await vscode.commands.executeCommand<unknown[]>('vscode.executeDocumentSymbolProvider', uri);
        const mapped = (symbols ?? []).map(serializeSymbol);
        return makeResult(id, mapped);
      }

      case 'vscode_get_definitions': {
        const locations = await executeLocationProvider(
          'vscode.executeDefinitionProvider',
          args.path as string,
          args.line as number,
          args.character as number,
        );
        return makeResult(id, locations);
      }

      case 'vscode_get_type_definitions': {
        const locations = await executeLocationProvider(
          'vscode.executeTypeDefinitionProvider',
          args.path as string,
          args.line as number,
          args.character as number,
        );
        return makeResult(id, locations);
      }

      case 'vscode_get_implementations': {
        const locations = await executeLocationProvider(
          'vscode.executeImplementationProvider',
          args.path as string,
          args.line as number,
          args.character as number,
        );
        return makeResult(id, locations);
      }

      case 'vscode_get_declarations': {
        const locations = await executeLocationProvider(
          'vscode.executeDeclarationProvider',
          args.path as string,
          args.line as number,
          args.character as number,
        );
        return makeResult(id, locations);
      }

      case 'vscode_get_references': {
        const locations = await executeLocationProvider(
          'vscode.executeReferenceProvider',
          args.path as string,
          args.line as number,
          args.character as number,
        );
        return makeResult(id, locations);
      }

      case 'vscode_get_hover': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const position = new vscode.Position(args.line as number, args.character as number);
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
          'vscode.executeHoverProvider',
          uri,
          position,
        );
        const contents = (hovers ?? []).flatMap((h) =>
          h.contents.map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value)),
        );
        return makeResult(id, contents);
      }

      case 'vscode_get_workspace_symbols': {
        const query = args.query as string;
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          query,
        );
        const mapped = (symbols ?? []).map((s) => ({
          name: s.name,
          kind: s.kind,
          containerName: s.containerName,
          location: serializeLocation(s.location),
        }));
        return makeResult(id, mapped);
      }

      case 'vscode_get_code_actions': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const position = new vscode.Position(args.line as number, args.character as number);
        const range = new vscode.Range(position, position);
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
          'vscode.executeCodeActionProvider',
          uri,
          range,
        );
        cachedCodeActions = actions ?? [];
        const mapped = cachedCodeActions.map((a, index) => ({
          title: a.title,
          kind: a.kind?.value,
          isPreferred: a.isPreferred ?? false,
          index,
        }));
        return makeResult(id, mapped);
      }

      case 'vscode_execute_code_action': {
        const actionIndex = args.actionIndex as number;
        if (cachedCodeActions.length === 0) {
          return makeErrorResult(id, 'No cached code actions. Call vscode_get_code_actions first.');
        }
        if (actionIndex < 0 || actionIndex >= cachedCodeActions.length) {
          return makeErrorResult(
            id,
            `Invalid action index ${actionIndex}. Available: 0-${cachedCodeActions.length - 1}`,
          );
        }
        const action = cachedCodeActions[actionIndex];
        if (action?.edit) {
          const applied = await vscode.workspace.applyEdit(action?.edit);
          if (!applied) {
            return makeErrorResult(id, `Failed to apply edit for code action: ${action?.title}`);
          }
        }
        if (action?.command) {
          const cmdArgs = (action?.command.arguments ?? []) as unknown[];
          await vscode.commands.executeCommand(action?.command.command, ...cmdArgs);
        }
        return makeResult(id, { executed: action?.title });
      }

      case 'vscode_apply_workspace_edit': {
        const edits = args.edits as Array<{
          path: string;
          range: { startLine: number; startChar: number; endLine: number; endChar: number };
          newText: string;
        }>;
        const workspaceEdit = new vscode.WorkspaceEdit();
        for (const edit of edits) {
          const uri = vscode.Uri.file(edit.path);
          const range = new vscode.Range(
            new vscode.Position(edit.range.startLine, edit.range.startChar),
            new vscode.Position(edit.range.endLine, edit.range.endChar),
          );
          workspaceEdit.replace(uri, range, edit.newText);
        }
        const applied = await vscode.workspace.applyEdit(workspaceEdit);
        return makeResult(id, { applied });
      }

      case 'vscode_format_document': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editorConfig = vscode.workspace.getConfiguration('editor', doc.uri);
        const formatOptions = {
          tabSize: editorConfig.get<number>('tabSize', 4),
          insertSpaces: editorConfig.get<boolean>('insertSpaces', true),
        };
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
          'vscode.executeFormatDocumentProvider',
          doc.uri,
          formatOptions,
        );
        if (edits && edits.length > 0) {
          const workspaceEdit = new vscode.WorkspaceEdit();
          for (const edit of edits) {
            workspaceEdit.replace(doc.uri, edit.range, edit.newText);
          }
          const applied = await vscode.workspace.applyEdit(workspaceEdit);
          if (!applied) {
            return makeErrorResult(id, `Failed to apply formatting edits for: ${filePath}`);
          }
        }
        return makeResult(id, { formatted: filePath });
      }

      case 'vscode_get_editor_state': {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return makeResult(id, {
            activeFile: null,
            cursor: null,
            selections: [],
            language: null,
            openEditors: [],
            workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
            diagnosticSummary: { errors: 0, warnings: 0, info: 0 },
          });
        }

        const uri = editor.document.uri;
        const allDiagnostics = vscode.languages.getDiagnostics(uri);
        let errors = 0;
        let warnings = 0;
        let info = 0;
        for (const d of allDiagnostics) {
          if (d.severity === vscode.DiagnosticSeverity.Error) {
            errors++;
          } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
            warnings++;
          } else {
            info++;
          }
        }

        return makeResult(id, {
          activeFile: uri.fsPath,
          cursor: {
            line: editor.selection.active.line,
            character: editor.selection.active.character,
          },
          selections: editor.selections.map((s) => ({
            start: { line: s.start.line, character: s.start.character },
            end: { line: s.end.line, character: s.end.character },
          })),
          language: editor.document.languageId,
          openEditors: vscode.window.visibleTextEditors.map((e) => e.document.uri.fsPath),
          workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
          diagnosticSummary: { errors, warnings, info },
        });
      }

      case 'vscode_save_document': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const saved = await doc.save();
        if (!saved) {
          return makeErrorResult(id, `Failed to save: ${filePath}`);
        }
        return makeResult(id, { saved: filePath });
      }

      case 'vscode_check_dirty': {
        const filePath = args.path as string;
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        return makeResult(id, { isDirty: doc.isDirty });
      }

      case 'vscode_show_notification': {
        const message = args.message as string;
        const severity = (args.severity as string) ?? 'info';
        switch (severity) {
          case 'warning':
            await vscode.window.showWarningMessage(message);
            break;
          case 'error':
            await vscode.window.showErrorMessage(message);
            break;
          default:
            await vscode.window.showInformationMessage(message);
            break;
        }
        return makeResult(id, { shown: true });
      }

      default:
        return makeErrorResult(id, `Unknown host tool: ${toolName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Host tool ${toolName} failed: ${message}`);
    return makeErrorResult(id, message);
  }
}

function makeResult(id: string, data: unknown): RpcHostToolResult {
  return {
    type: 'host_tool_result',
    id,
    result: { data },
  };
}

function makeErrorResult(id: string, error: string): RpcHostToolResult {
  return {
    type: 'host_tool_result',
    id,
    result: { data: error },
    isError: true,
  };
}
