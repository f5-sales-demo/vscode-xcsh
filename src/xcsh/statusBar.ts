// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

function updateStatusBar(item: vscode.StatusBarItem): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    item.text = 'xcsh';
    return;
  }

  const fileName = editor.document.fileName.split('/').pop() ?? editor.document.fileName;
  const line = editor.selection.active.line + 1;
  const col = editor.selection.active.character + 1;
  const lang = editor.document.languageId;

  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === vscode.DiagnosticSeverity.Error) {
      errors++;
    } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
      warnings++;
    }
  }

  item.text = `${fileName}:${line}:${col} | ${lang} | E:${errors} W:${warnings}`;
}

export function createXcshStatusBar(subscriptions: vscode.Disposable[]): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  item.tooltip = 'xcsh editor context';
  updateStatusBar(item);
  item.show();

  subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar(item)));
  subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => updateStatusBar(item)));
  subscriptions.push(vscode.languages.onDidChangeDiagnostics(() => updateStatusBar(item)));
  subscriptions.push(item);

  return item;
}
