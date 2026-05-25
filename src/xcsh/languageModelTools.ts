// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

// ───────── Input Types ─────────

interface ReadFileInput {
  path: string;
}

interface GetDiagnosticsInput {
  path: string;
}

interface OpenFileInput {
  path: string;
  line?: number;
}

// ───────── Path Resolution ─────────

export function resolveFilePath(inputPath: string): vscode.Uri {
  if (inputPath.startsWith('/') || /^[a-zA-Z]:/.test(inputPath)) {
    return vscode.Uri.file(inputPath);
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (workspaceRoot) {
    return vscode.Uri.joinPath(workspaceRoot, inputPath);
  }
  return vscode.Uri.file(inputPath);
}

// ───────── Read File Tool ─────────

export class ReadFileTool implements vscode.LanguageModelTool<ReadFileInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ReadFileInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const fileName = options.input.path.split('/').pop() ?? options.input.path;
    return Promise.resolve({
      invocationMessage: `Reading ${fileName}`,
      confirmationMessages: {
        title: 'Read File',
        message: new vscode.MarkdownString(`Read contents of \`${options.input.path}\`?`),
      },
    });
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReadFileInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const uri = resolveFilePath(options.input.path);
      const content = await vscode.workspace.fs.readFile(uri);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(new TextDecoder().decode(content))]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Error reading file: ${message}`)]);
    }
  }
}

// ───────── Get Selection Tool ─────────

export class GetSelectionTool implements vscode.LanguageModelTool<Record<string, never>> {
  prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return Promise.resolve({
      invocationMessage: 'Getting editor selection',
    });
  }

  invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return Promise.resolve(new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('')]));
    }
    const text = editor.document.getText(editor.selection);
    return Promise.resolve(new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]));
  }
}

// ───────── Get Diagnostics Tool ─────────

const SEVERITY_LABELS = ['Error', 'Warning', 'Information', 'Hint'] as const;

export class GetDiagnosticsTool implements vscode.LanguageModelTool<GetDiagnosticsInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GetDiagnosticsInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const fileName = options.input.path.split('/').pop() ?? options.input.path;
    return Promise.resolve({
      invocationMessage: `Getting diagnostics for ${fileName}`,
    });
  }

  invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetDiagnosticsInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const uri = resolveFilePath(options.input.path);
    const diagnostics = vscode.languages.getDiagnostics(uri);

    const items = diagnostics.map((d) => ({
      severity: SEVERITY_LABELS[d.severity] ?? 'Unknown',
      line: d.range.start.line + 1,
      message: d.message,
      source: d.source ?? 'unknown',
    }));

    return Promise.resolve(
      new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(items))]),
    );
  }
}

// ───────── Open File Tool ─────────

export class OpenFileTool implements vscode.LanguageModelTool<OpenFileInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<OpenFileInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const fileName = options.input.path.split('/').pop() ?? options.input.path;
    const lineInfo = options.input.line !== undefined ? ` at line ${String(options.input.line)}` : '';
    return Promise.resolve({
      invocationMessage: `Opening ${fileName}${lineInfo}`,
      confirmationMessages: {
        title: 'Open File',
        message: new vscode.MarkdownString(`Open \`${options.input.path}\`${lineInfo}?`),
      },
    });
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<OpenFileInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const uri = resolveFilePath(options.input.path);
      const doc = await vscode.workspace.openTextDocument(uri);

      const showOptions: vscode.TextDocumentShowOptions = {};
      if (options.input.line !== undefined) {
        const position = new vscode.Position(options.input.line, 0);
        showOptions.selection = new vscode.Range(position, position);
      }

      await vscode.window.showTextDocument(doc, showOptions);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Opened ${options.input.path}`)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Error opening file: ${message}`)]);
    }
  }
}

// ───────── Registration ─────────

export function registerLanguageModelTools(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.lm.registerTool('f5xc-readFile', new ReadFileTool()));
  context.subscriptions.push(vscode.lm.registerTool('f5xc-getSelection', new GetSelectionTool()));
  context.subscriptions.push(vscode.lm.registerTool('f5xc-getDiagnostics', new GetDiagnosticsTool()));
  context.subscriptions.push(vscode.lm.registerTool('f5xc-openFile', new OpenFileTool()));
}
