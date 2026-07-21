// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { resolveAttachments } from '../../xcsh/attachmentResolvers';

jest.mock('node:fs', () => ({ ...jest.requireActual('node:fs'), realpathSync: jest.fn((p: string) => p) }));

// biome-ignore lint/style/useImportType: realpathSync is consumed as a runtime mock handle
import { realpathSync } from 'node:fs';

const realpathSyncMock = realpathSync as unknown as jest.Mock;

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

const extensionsMock = vscode.extensions as unknown as { getExtension: jest.Mock };
const workspaceMock = vscode.workspace as unknown as {
  workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;
  getConfiguration: jest.Mock;
};

function setWorkspaceFolder(fsPath: string): void {
  workspaceMock.workspaceFolders = [{ uri: vscode.Uri.file(fsPath) }];
}
function setInstructionFilesConfig(files: string[]): void {
  workspaceMock.getConfiguration.mockReturnValue({
    get: (_key: string, fallback?: unknown) => (files.length ? files : (fallback ?? files)),
    has: jest.fn(),
    inspect: jest.fn(),
    update: jest.fn(),
  });
}

describe('resolveAttachments — instructions', () => {
  beforeEach(() => {
    setWorkspaceFolder('/ws');
    setInstructionFilesConfig([]);
    realpathSyncMock.mockImplementation((p: string) => p);
  });

  it('lists existing candidate files and attaches the picked one', async () => {
    fsMock.stat.mockImplementation((uri: { fsPath: string }) =>
      uri.fsPath.endsWith('CLAUDE.md')
        ? Promise.resolve({ type: vscode.FileType.File, size: 10 })
        : Promise.reject(new Error('ENOENT')),
    );
    win.showQuickPick.mockResolvedValue({ label: 'CLAUDE.md', sourcePath: '/ws/CLAUDE.md' });
    fsMock.readFile.mockResolvedValue(new TextEncoder().encode('# Instructions'));

    const result = await resolveAttachments('instructions');
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('instructions');
    expect(result[0]?.dedupKey).toBe('instructions:/ws/CLAUDE.md');
    expect(result[0]?.content).toBe('# Instructions');
  });

  it('offers files from the xcsh.instructionFiles config', async () => {
    setInstructionFilesConfig(['docs/PROMPT.md']);
    fsMock.stat.mockImplementation((uri: { fsPath: string }) =>
      uri.fsPath.endsWith('docs/PROMPT.md')
        ? Promise.resolve({ type: vscode.FileType.File, size: 5 })
        : Promise.reject(new Error('ENOENT')),
    );
    let offered: string[] = [];
    win.showQuickPick.mockImplementation((items: Array<{ label: string }>) => {
      offered = items.map((i) => i.label);
      return Promise.resolve(undefined);
    });
    await resolveAttachments('instructions');
    expect(offered).toContain('docs/PROMPT.md');
  });

  it('informs and returns empty when no instruction files exist', async () => {
    fsMock.stat.mockRejectedValue(new Error('ENOENT'));
    expect(await resolveAttachments('instructions')).toEqual([]);
    expect(win.showInformationMessage).toHaveBeenCalled();
  });

  it('rejects instructionFiles entries that escape the workspace folder', async () => {
    setInstructionFilesConfig(['../../etc/passwd']);
    // Even if stat would succeed for anything, the escaping path must never be offered.
    fsMock.stat.mockResolvedValue({ type: vscode.FileType.File, size: 10 });
    let offered: string[] = [];
    win.showQuickPick.mockImplementation((items: Array<{ label: string }>) => {
      offered = items.map((i) => i.label);
      return Promise.resolve(undefined);
    });
    await resolveAttachments('instructions');
    expect(offered).not.toContain('../../etc/passwd');
    expect(offered.some((l) => l.includes('passwd'))).toBe(false);
  });

  it('rejects an in-workspace symlink that resolves outside the workspace', async () => {
    setInstructionFilesConfig(['docs/evil.md']);
    fsMock.stat.mockResolvedValue({ type: vscode.FileType.File, size: 10 });
    // The lexical path stays inside /ws, but its realpath escapes via a symlink.
    realpathSyncMock.mockImplementation((p: string) => (p.endsWith('docs/evil.md') ? '/etc/passwd' : p));
    let offered: string[] = [];
    win.showQuickPick.mockImplementation((items: Array<{ label: string }>) => {
      offered = items.map((i) => i.label);
      return Promise.resolve(undefined);
    });
    await resolveAttachments('instructions');
    expect(offered).not.toContain('docs/evil.md');
  });

  it('returns empty when the quick pick is cancelled', async () => {
    fsMock.stat.mockResolvedValue({ type: vscode.FileType.File, size: 10 });
    win.showQuickPick.mockResolvedValue(undefined);
    expect(await resolveAttachments('instructions')).toEqual([]);
  });
});

describe('resolveAttachments — source control', () => {
  function mockGit(repo: unknown): void {
    extensionsMock.getExtension.mockReturnValue({
      isActive: true,
      activate: jest.fn().mockResolvedValue(undefined),
      exports: { getAPI: () => ({ repositories: repo ? [repo] : [] }) },
    });
  }

  it('warns and returns empty when the git extension is unavailable', async () => {
    extensionsMock.getExtension.mockReturnValue(undefined);
    expect(await resolveAttachments('scm')).toEqual([]);
    expect(win.showWarningMessage).toHaveBeenCalled();
  });

  it('informs and returns empty when there are no changes', async () => {
    mockGit({ rootUri: vscode.Uri.file('/ws'), state: { workingTreeChanges: [], indexChanges: [] } });
    expect(await resolveAttachments('scm')).toEqual([]);
    expect(win.showInformationMessage).toHaveBeenCalled();
  });

  it('attaches the diff of the selected changed files', async () => {
    const diffWithHEAD = jest.fn().mockResolvedValue('@@ -1 +1 @@\n-old\n+new');
    mockGit({
      rootUri: vscode.Uri.file('/ws'),
      state: {
        workingTreeChanges: [{ uri: vscode.Uri.file('/ws/src/a.ts') }],
        indexChanges: [],
      },
      diffWithHEAD,
    });
    win.showQuickPick.mockResolvedValue([{ label: 'src/a.ts', fsPath: '/ws/src/a.ts' }]);

    const result = await resolveAttachments('scm');
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('scm');
    expect(result[0]?.dedupKey).toBe('scm:/ws');
    expect(result[0]?.content).toContain('+new');
    expect(diffWithHEAD).toHaveBeenCalledWith('/ws/src/a.ts');
  });

  it('returns empty when file selection is cancelled', async () => {
    mockGit({
      rootUri: vscode.Uri.file('/ws'),
      state: { workingTreeChanges: [{ uri: vscode.Uri.file('/ws/a.ts') }], indexChanges: [] },
      diffWithHEAD: jest.fn(),
    });
    win.showQuickPick.mockResolvedValue(undefined);
    expect(await resolveAttachments('scm')).toEqual([]);
  });
});
