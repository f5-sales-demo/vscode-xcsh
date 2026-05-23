// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import type { RpcHostToolCall, RpcHostToolDefinition, RpcHostToolResult } from './types';

const logger = getLogger();

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
];

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
