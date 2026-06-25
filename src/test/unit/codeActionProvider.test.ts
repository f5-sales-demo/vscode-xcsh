// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { XCSHCodeActionProvider } from '../../providers/xcshCodeActionProvider';

function createMockDocument(content: string) {
  const lines = content.split('\n');
  return {
    uri: vscode.Uri.file('/test/file.json'),
    getText: () => content,
    lineAt: (line: number) => ({ text: lines[line] || '' }),
    positionAt: (offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = (lines[i] || '').length + 1;
        if (remaining < lineLen) {
          return new vscode.Position(i, remaining);
        }
        remaining -= lineLen;
      }
      return new vscode.Position(lines.length - 1, 0);
    },
    lineCount: lines.length,
  } as unknown as vscode.TextDocument;
}

describe('XCSHCodeActionProvider', () => {
  const provider = new XCSHCodeActionProvider();

  it('provides quick fixes for conflict diagnostics', () => {
    const content = `{
  "spec": {
    "disable_waf": {},
    "app_firewall": {}
  }
}`;
    const doc = createMockDocument(content);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(2, 4, 2, 18),
      '"disable_waf" conflicts with "app_firewall" — only one should be set',
      vscode.DiagnosticSeverity.Warning,
    );

    const actions = provider.provideCodeActions(doc, new vscode.Range(2, 4, 2, 18), {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    });

    expect(actions.length).toBe(2);
    const labels = actions.map((a) => a.title);
    expect(labels).toContain('Remove "disable_waf"');
    expect(labels).toContain('Remove "app_firewall"');
  });

  it('returns empty for non-conflict diagnostics', () => {
    const doc = createMockDocument('{}');
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'Some other warning',
      vscode.DiagnosticSeverity.Warning,
    );

    const actions = provider.provideCodeActions(doc, new vscode.Range(0, 0, 0, 1), {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    });

    expect(actions.length).toBe(0);
  });

  it('sets QuickFix kind on code actions', () => {
    const content = `{
  "spec": {
    "no_challenge": {},
    "js_challenge": {}
  }
}`;
    const doc = createMockDocument(content);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(2, 4, 2, 18),
      '"no_challenge" conflicts with "js_challenge" — only one should be set',
      vscode.DiagnosticSeverity.Warning,
    );

    const actions = provider.provideCodeActions(doc, new vscode.Range(2, 4, 2, 18), {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    });

    for (const action of actions) {
      expect(action.kind).toBe(vscode.CodeActionKind.QuickFix);
    }
  });

  it('attaches workspace edit to each action', () => {
    const content = `{
  "spec": {
    "disable_waf": {},
    "app_firewall": {}
  }
}`;
    const doc = createMockDocument(content);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(2, 4, 2, 18),
      '"disable_waf" conflicts with "app_firewall" — only one should be set',
      vscode.DiagnosticSeverity.Warning,
    );

    const actions = provider.provideCodeActions(doc, new vscode.Range(2, 4, 2, 18), {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    });

    for (const action of actions) {
      expect(action.edit).toBeDefined();
    }
  });
});
