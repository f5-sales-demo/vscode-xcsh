// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { formatDiagnostics } from '../../xcsh/diagnosticsSerializer';
import { formatWorkspaceSymbols } from '../../xcsh/symbolSerializer';

describe('formatDiagnostics', () => {
  it('groups diagnostics by file with severity labels and 1-based positions', () => {
    const text = formatDiagnostics([
      {
        path: 'src/foo.ts',
        diagnostics: [
          { severity: 0, message: 'Cannot find name', range: { start: { line: 11, character: 2 } }, source: 'ts' },
          { severity: 1, message: 'Unused var', range: { start: { line: 19, character: 0 } } },
        ],
      },
    ]);
    expect(text).toContain('src/foo.ts');
    expect(text).toContain('[Error] 12:3 Cannot find name (ts)');
    expect(text).toContain('[Warning] 20:1 Unused var');
  });

  it('returns a clear message when there are no diagnostics', () => {
    expect(formatDiagnostics([])).toBe('No problems reported.');
  });
});

describe('formatWorkspaceSymbols', () => {
  it('renders each symbol with kind, container, and file:line', () => {
    const text = formatWorkspaceSymbols([
      { name: 'handleSubmit', kind: 11, containerName: 'InputBar', path: 'webview/src/InputBar.tsx', line: 25 },
      { name: 'MyClass', kind: 4, containerName: '', path: 'src/a.ts', line: 0 },
    ]);
    expect(text).toContain('Function handleSubmit — InputBar (webview/src/InputBar.tsx:26)');
    expect(text).toContain('Class MyClass (src/a.ts:1)');
  });

  it('returns a clear message when no symbols match', () => {
    expect(formatWorkspaceSymbols([])).toBe('No symbols found.');
  });
});
