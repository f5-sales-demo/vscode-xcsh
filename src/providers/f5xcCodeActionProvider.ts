// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

export class F5XCCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (!diagnostic.message.includes('conflicts with')) {
        continue;
      }

      const match = diagnostic.message.match(/"([^"]+)" conflicts with "([^"]+)"/);
      if (!match?.[1] || !match[2]) {
        continue;
      }

      const fieldA = match[1];
      const fieldB = match[2];

      const removeA = new vscode.CodeAction(`Remove "${fieldA}"`, vscode.CodeActionKind.QuickFix);
      removeA.diagnostics = [diagnostic];
      removeA.edit = buildRemoveFieldEdit(document, fieldA);
      if (removeA.edit) {
        actions.push(removeA);
      }

      const removeB = new vscode.CodeAction(`Remove "${fieldB}"`, vscode.CodeActionKind.QuickFix);
      removeB.diagnostics = [diagnostic];
      removeB.edit = buildRemoveFieldEdit(document, fieldB);
      if (removeB.edit) {
        actions.push(removeB);
      }
    }

    return actions;
  }
}

function buildRemoveFieldEdit(document: vscode.TextDocument, fieldName: string): vscode.WorkspaceEdit | undefined {
  const text = document.getText();
  const pattern = new RegExp(`^\\s*"${fieldName}"\\s*:.*$`, 'gm');
  const match = pattern.exec(text);

  if (!match) {
    return undefined;
  }

  const startOffset = match.index;
  const startPos = document.positionAt(startOffset);

  let endLine = startPos.line;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  const lineText = match[0];

  for (const char of lineText) {
    if (char === '"') {
      inString = !inString;
    }
    if (!inString) {
      if (char === '{') {
        braceDepth++;
      }
      if (char === '}') {
        braceDepth--;
      }
      if (char === '[') {
        bracketDepth++;
      }
      if (char === ']') {
        bracketDepth--;
      }
    }
  }

  if (braceDepth > 0 || bracketDepth > 0) {
    for (let i = startPos.line + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      for (const char of line) {
        if (char === '"') {
          inString = !inString;
        }
        if (!inString) {
          if (char === '{') {
            braceDepth++;
          }
          if (char === '}') {
            braceDepth--;
          }
          if (char === '[') {
            bracketDepth++;
          }
          if (char === ']') {
            bracketDepth--;
          }
        }
      }
      endLine = i;
      if (braceDepth <= 0 && bracketDepth <= 0) {
        break;
      }
    }
  }

  let deleteEnd = endLine + 1;
  if (deleteEnd < document.lineCount) {
    const nextLine = document.lineAt(deleteEnd).text.trim();
    if (nextLine === '' || nextLine === ',') {
      deleteEnd++;
    }
  }

  const range = new vscode.Range(startPos.line, 0, Math.min(deleteEnd, document.lineCount), 0);
  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, range);
  return edit;
}
