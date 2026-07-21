// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { resolveAttachments } from '../../xcsh/attachmentResolvers';

const win = vscode.window as unknown as {
  showOpenDialog: jest.Mock;
  showQuickPick: jest.Mock;
  showInputBox: jest.Mock;
  showInformationMessage: jest.Mock;
  showWarningMessage: jest.Mock;
};
const langs = vscode.languages as unknown as { getDiagnostics: jest.Mock };
const cmds = vscode.commands as unknown as { executeCommand: jest.Mock };
const fsMock = vscode.workspace.fs as unknown as { stat: jest.Mock; readFile: jest.Mock; readDirectory: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  langs.getDiagnostics.mockReturnValue([]);
});

describe('resolveAttachments — problems', () => {
  it('returns empty and informs the user when there are no diagnostics', async () => {
    langs.getDiagnostics.mockReturnValue([]);
    const result = await resolveAttachments('problems');
    expect(result).toEqual([]);
    expect(win.showInformationMessage).toHaveBeenCalled();
  });

  it('builds a ProblemsAttachment for the picked file', async () => {
    const uri = vscode.Uri.file('/ws/src/foo.ts');
    langs.getDiagnostics.mockReturnValue([
      [uri, [{ severity: 0, message: 'boom', range: { start: { line: 0, character: 0 } }, source: 'ts' }]],
    ]);
    win.showQuickPick.mockResolvedValue({ label: 'src/foo.ts', scope: '/ws/src/foo.ts' });

    const result = await resolveAttachments('problems');
    expect(result).toHaveLength(1);
    const att = result[0];
    expect(att?.kind).toBe('problems');
    expect(att?.dedupKey).toBe('problems:/ws/src/foo.ts');
    expect(att?.content).toContain('[Error] 1:1 boom (ts)');
  });

  it('returns empty when the quick pick is cancelled', async () => {
    const uri = vscode.Uri.file('/ws/a.ts');
    langs.getDiagnostics.mockReturnValue([
      [uri, [{ severity: 1, message: 'w', range: { start: { line: 0, character: 0 } } }]],
    ]);
    win.showQuickPick.mockResolvedValue(undefined);
    expect(await resolveAttachments('problems')).toEqual([]);
  });
});

describe('resolveAttachments — symbols', () => {
  it('builds a SymbolsAttachment from picked symbols', async () => {
    win.showInputBox.mockResolvedValue('handleSubmit');
    cmds.executeCommand.mockResolvedValue([
      {
        name: 'handleSubmit',
        kind: 11,
        containerName: 'InputBar',
        location: { uri: vscode.Uri.file('/ws/InputBar.tsx'), range: { start: { line: 24, character: 0 } } },
      },
    ]);
    win.showQuickPick.mockResolvedValue([{ label: 'handleSubmit', index: 0 }]);

    const result = await resolveAttachments('symbols');
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('symbols');
    expect(result[0]?.dedupKey).toBe('symbols:handleSubmit');
    expect(result[0]?.content).toContain('Function handleSubmit — InputBar (/ws/InputBar.tsx:25)');
  });

  it('returns empty when the query is cancelled', async () => {
    win.showInputBox.mockResolvedValue(undefined);
    expect(await resolveAttachments('symbols')).toEqual([]);
    expect(cmds.executeCommand).not.toHaveBeenCalled();
  });

  it('returns empty and informs when no symbols match', async () => {
    win.showInputBox.mockResolvedValue('zzz');
    cmds.executeCommand.mockResolvedValue([]);
    expect(await resolveAttachments('symbols')).toEqual([]);
    expect(win.showInformationMessage).toHaveBeenCalled();
  });
});

describe('resolveAttachments — files & folders', () => {
  it('builds a FileAttachment for a selected file', async () => {
    const uri = vscode.Uri.file('/ws/a.ts');
    win.showOpenDialog.mockResolvedValue([uri]);
    fsMock.stat.mockResolvedValue({ type: vscode.FileType.File, size: 5 });
    fsMock.readFile.mockResolvedValue(new TextEncoder().encode('hello'));

    const result = await resolveAttachments('files');
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('file');
    expect(result[0]?.label).toBe('a.ts');
    expect(result[0]?.content).toBe('hello');
    expect(result[0]?.dedupKey).toBe('file:/ws/a.ts');
  });

  it('builds a FolderAttachment listing for a selected folder', async () => {
    const dir = vscode.Uri.file('/ws/pkg');
    win.showOpenDialog.mockResolvedValue([dir]);
    fsMock.stat.mockResolvedValue({ type: vscode.FileType.Directory, size: 0 });
    fsMock.readDirectory.mockResolvedValue([
      ['index.ts', vscode.FileType.File],
      ['util.ts', vscode.FileType.File],
    ]);

    const result = await resolveAttachments('files');
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('folder');
    expect(result[0]?.content).toContain('index.ts');
    expect(result[0]?.content).toContain('util.ts');
    expect(result[0]?.dedupKey).toBe('folder:/ws/pkg');
  });

  it('returns empty when the open dialog is cancelled', async () => {
    win.showOpenDialog.mockResolvedValue(undefined);
    expect(await resolveAttachments('files')).toEqual([]);
  });
});
