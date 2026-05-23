// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { getSchemaForDocument, isF5XCJsonFile } from '../utils/completionHelper';

export interface ConflictEntry {
  field: string;
  conflictsWith: string;
}

// Pure function — exported for testing
export function findConflicts(specProperties: Record<string, unknown>, setFields: string[]): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  const setFieldSet = new Set(setFields);

  for (const field of setFields) {
    const propSchema = specProperties[field];
    if (!propSchema || typeof propSchema !== 'object') {
      continue;
    }
    const conflictList = (propSchema as Record<string, unknown>)['x-f5xc-conflicts-with'];
    if (!Array.isArray(conflictList)) {
      continue;
    }
    for (const conflicting of conflictList) {
      if (typeof conflicting === 'string' && setFieldSet.has(conflicting)) {
        conflicts.push({ field, conflictsWith: conflicting });
      }
    }
  }
  return conflicts;
}

export function registerConflictDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('f5xc-conflicts');
  context.subscriptions.push(diagnosticCollection);

  const checkDocument = (document: vscode.TextDocument) => {
    if (!isF5XCJsonFile(document)) {
      return;
    }

    const schema = getSchemaForDocument(document);
    if (!schema?.properties?.spec?.properties) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(document.getText()) as Record<string, unknown>;
    } catch {
      diagnosticCollection.delete(document.uri);
      return;
    }

    const spec = parsed.spec;
    if (!spec || typeof spec !== 'object') {
      diagnosticCollection.delete(document.uri);
      return;
    }

    const setFields = Object.keys(spec as Record<string, unknown>).filter((key) => {
      const value = (spec as Record<string, unknown>)[key];
      return value !== null && value !== undefined && value !== '';
    });

    const conflicts = findConflicts(schema.properties.spec.properties, setFields);
    if (conflicts.length === 0) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];
    for (const conflict of conflicts) {
      const fieldPattern = new RegExp(`"${conflict.field}"\\s*:`);
      const match = fieldPattern.exec(text);
      if (match) {
        const pos = document.positionAt(match.index);
        const range = new vscode.Range(pos, pos.translate(0, match[0].length));
        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `"${conflict.field}" conflicts with "${conflict.conflictsWith}" — only one should be set`,
            vscode.DiagnosticSeverity.Warning,
          ),
        );
      }
    }
    diagnosticCollection.set(document.uri, diagnostics);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => checkDocument(e.document)),
    vscode.workspace.onDidOpenTextDocument(checkDocument),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnosticCollection.delete(doc.uri)),
  );

  for (const doc of vscode.workspace.textDocuments) {
    checkDocument(doc);
  }
  return diagnosticCollection;
}
