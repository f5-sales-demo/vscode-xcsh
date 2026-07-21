// src/xcsh/symbolSerializer.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Renders workspace symbols as human-readable text for the "Symbols" chat
// attachment. Decoupled from `vscode` types so it unit-tests without mocks.

/** Minimal workspace-symbol shape (maps from `vscode.SymbolInformation`). */
export interface WorkspaceSymbolLike {
  name: string;
  /** vscode.SymbolKind numeric value. */
  kind: number;
  containerName?: string;
  path: string;
  /** 0-based line (as reported by vscode); rendered 1-based. */
  line: number;
}

// Index matches vscode.SymbolKind ordering.
const SYMBOL_KIND_NAMES = [
  'File',
  'Module',
  'Namespace',
  'Package',
  'Class',
  'Method',
  'Property',
  'Field',
  'Constructor',
  'Enum',
  'Interface',
  'Function',
  'Variable',
  'Constant',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Key',
  'Null',
  'EnumMember',
  'Struct',
  'Event',
  'Operator',
  'TypeParameter',
];

function kindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? 'Symbol';
}

/** Format a flat list of workspace symbols, one per line. */
export function formatWorkspaceSymbols(symbols: WorkspaceSymbolLike[]): string {
  if (symbols.length === 0) {
    return 'No symbols found.';
  }
  return symbols
    .map((s) => {
      const container = s.containerName ? ` — ${s.containerName}` : '';
      return `${kindName(s.kind)} ${s.name}${container} (${s.path}:${s.line + 1})`;
    })
    .join('\n');
}
