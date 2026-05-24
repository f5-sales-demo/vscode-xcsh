// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import {
  GetDiagnosticsTool,
  GetSelectionTool,
  OpenFileTool,
  ReadFileTool,
  registerLanguageModelTools,
} from '../../xcsh/languageModelTools';

describe('ReadFileTool', () => {
  const tool = new ReadFileTool();

  it('prepareInvocation returns confirmation with file path', async () => {
    const result = await tool.prepareInvocation(
      { input: { path: '/workspace/test.ts' } },
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect(result).toBeDefined();
    expect(result?.invocationMessage).toContain('test.ts');
  });

  it('invoke reads file and returns content', async () => {
    const fileContent = new TextEncoder().encode('const x = 1;');
    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(fileContent);

    const result = await tool.invoke(
      { input: { path: '/workspace/test.ts' } } as vscode.LanguageModelToolInvocationOptions<{ path: string }>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect(result).toBeInstanceOf(vscode.LanguageModelToolResult);
    expect(result.content).toHaveLength(1);
    expect((result.content[0] as vscode.LanguageModelTextPart).value).toBe('const x = 1;');
  });

  it('invoke returns error message on failure', async () => {
    (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

    const result = await tool.invoke(
      { input: { path: '/nonexistent.ts' } } as vscode.LanguageModelToolInvocationOptions<{ path: string }>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect(result).toBeInstanceOf(vscode.LanguageModelToolResult);
    expect((result.content[0] as vscode.LanguageModelTextPart).value).toContain('File not found');
  });
});

describe('GetSelectionTool', () => {
  const tool = new GetSelectionTool();

  it('prepareInvocation returns confirmation', async () => {
    const result = await tool.prepareInvocation(
      { input: {} },
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect(result).toBeDefined();
    expect(result?.invocationMessage).toContain('selection');
  });

  it('invoke returns selected text', async () => {
    const mockEditor = {
      document: { getText: jest.fn(() => 'selected code') },
      selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 13 } },
    };
    Object.defineProperty(vscode.window, 'activeTextEditor', { value: mockEditor, writable: true });

    const result = await tool.invoke(
      { input: {} } as vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect((result.content[0] as vscode.LanguageModelTextPart).value).toBe('selected code');

    Object.defineProperty(vscode.window, 'activeTextEditor', { value: undefined, writable: true });
  });

  it('invoke returns empty message when no editor', async () => {
    Object.defineProperty(vscode.window, 'activeTextEditor', { value: undefined, writable: true });

    const result = await tool.invoke(
      { input: {} } as vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect((result.content[0] as vscode.LanguageModelTextPart).value).toContain('No active editor');
  });
});

describe('GetDiagnosticsTool', () => {
  const tool = new GetDiagnosticsTool();

  it('invoke returns diagnostics as JSON', async () => {
    const mockDiagnostics = [
      {
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Type error',
        severity: 0,
        source: 'ts',
      },
    ];
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValue(mockDiagnostics);

    const result = await tool.invoke(
      { input: { path: '/workspace/test.ts' } } as vscode.LanguageModelToolInvocationOptions<{ path: string }>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    const text = (result.content[0] as vscode.LanguageModelTextPart).value;
    expect(text).toContain('Type error');
    expect(text).toContain('line 5');
  });

  it('invoke returns no-diagnostics message for clean file', async () => {
    (vscode.languages.getDiagnostics as jest.Mock).mockReturnValue([]);

    const result = await tool.invoke(
      { input: { path: '/workspace/clean.ts' } } as vscode.LanguageModelToolInvocationOptions<{ path: string }>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect((result.content[0] as vscode.LanguageModelTextPart).value).toContain('No diagnostics');
  });
});

describe('OpenFileTool', () => {
  const tool = new OpenFileTool();

  it('invoke opens file in editor', async () => {
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({ uri: { fsPath: '/test.ts' } });
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(undefined);

    const result = await tool.invoke(
      { input: { path: '/test.ts' } } as vscode.LanguageModelToolInvocationOptions<{ path: string; line?: number }>,
      { isCancellationRequested: false, onCancellationRequested: jest.fn() },
    );
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
    expect((result.content[0] as vscode.LanguageModelTextPart).value).toContain('/test.ts');
  });
});

describe('registerLanguageModelTools', () => {
  it('registers all 4 tools', () => {
    const context = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: vscode.Uri.file('/mock'),
    } as unknown as vscode.ExtensionContext;

    registerLanguageModelTools(context);
    expect(vscode.lm.registerTool).toHaveBeenCalledTimes(4);
    expect(context.subscriptions).toHaveLength(4);
  });
});
