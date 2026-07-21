// src/xcsh/diagnosticsSerializer.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Renders diagnostics as human-readable text for the "Problems" chat
// attachment. This is intentionally decoupled from `vscode` types (it takes a
// minimal shape) so it unit-tests without mocks. Distinct from the structured
// JSON mapping in `hostTools.ts`, which feeds the agent's tool-response path.

/** Minimal diagnostic shape (maps 1:1 from `vscode.Diagnostic`). */
export interface DiagnosticLike {
  /** vscode.DiagnosticSeverity: 0=Error, 1=Warning, 2=Information, 3=Hint. */
  severity: number;
  message: string;
  range: { start: { line: number; character: number } };
  source?: string;
}

export interface DiagnosticFileEntry {
  path: string;
  diagnostics: DiagnosticLike[];
}

const SEVERITY_LABEL = ['Error', 'Warning', 'Information', 'Hint'];

function severityLabel(severity: number): string {
  return SEVERITY_LABEL[severity] ?? 'Info';
}

/** Format diagnostics grouped by file, with 1-based line/column positions. */
export function formatDiagnostics(entries: DiagnosticFileEntry[]): string {
  const withDiags = entries.filter((e) => e.diagnostics.length > 0);
  if (withDiags.length === 0) {
    return 'No problems reported.';
  }
  const blocks = withDiags.map((entry) => {
    const lines = entry.diagnostics.map((d) => {
      const pos = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
      const src = d.source ? ` (${d.source})` : '';
      return `  [${severityLabel(d.severity)}] ${pos} ${d.message}${src}`;
    });
    return `${entry.path}\n${lines.join('\n')}`;
  });
  return blocks.join('\n\n');
}
