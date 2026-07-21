// src/xcsh/attachmentResolvers.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Resolves host-side attachment categories (Files/Folders, Problems, Symbols,
// Instructions, Source Control) into typed `Attachment` objects. Each category
// drives its own VS Code picker, then serializes the result to text (the agent
// path is text-only). Callers post the results to the webview as
// `attachment_added` messages.

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { MAX_ATTACHMENT_BYTES } from './attachment';
import type { Attachment, FileAttachment, FolderAttachment, HostAttachmentCategory } from './attachmentTypes';
import { type DiagnosticFileEntry, formatDiagnostics } from './diagnosticsSerializer';
import { formatWorkspaceSymbols, type WorkspaceSymbolLike } from './symbolSerializer';

const FOLDER_ENTRY_CAP = 500;

/** Path relative to the first workspace folder, or the absolute path. */
function relPath(uri: vscode.Uri): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder && uri.fsPath.startsWith(folder.uri.fsPath)) {
    return uri.fsPath.slice(folder.uri.fsPath.length + 1);
  }
  return uri.fsPath;
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Reject an over-budget attachment with a warning; otherwise return it. */
function sizeGuard(att: Attachment): Attachment[] {
  const bytes = byteLength(att.content);
  if (bytes > MAX_ATTACHMENT_BYTES) {
    void vscode.window.showWarningMessage(
      vscode.l10n.t(
        'Attachment too large ({0}KB). Maximum is {1}KB.',
        Math.round(bytes / 1024),
        Math.round(MAX_ATTACHMENT_BYTES / 1024),
      ),
    );
    return [];
  }
  return [att];
}

export async function resolveAttachments(category: HostAttachmentCategory): Promise<Attachment[]> {
  switch (category) {
    case 'files':
      return resolveFiles();
    case 'problems':
      return resolveProblems();
    case 'symbols':
      return resolveSymbols();
    case 'instructions':
      return resolveInstructions();
    case 'scm':
      return resolveScm();
    default:
      return [];
  }
}

async function resolveFiles(): Promise<Attachment[]> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: true,
    canSelectFiles: true,
    canSelectFolders: true,
    openLabel: vscode.l10n.t('Attach'),
  });
  if (!uris || uris.length === 0) {
    return [];
  }
  const out: Attachment[] = [];
  for (const uri of uris) {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type === vscode.FileType.Directory) {
      out.push(...(await buildFolderAttachment(uri)));
    } else {
      out.push(...(await buildFileAttachment(uri, stat.size)));
    }
  }
  return out;
}

async function buildFileAttachment(uri: vscode.Uri, size: number): Promise<Attachment[]> {
  if (size > MAX_ATTACHMENT_BYTES) {
    void vscode.window.showWarningMessage(
      vscode.l10n.t(
        'File too large to attach ({0}KB). Maximum is {1}KB.',
        Math.round(size / 1024),
        Math.round(MAX_ATTACHMENT_BYTES / 1024),
      ),
    );
    return [];
  }
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = new TextDecoder().decode(bytes);
  const att: FileAttachment = {
    id: randomUUID(),
    kind: 'file',
    label: path.basename(uri.fsPath),
    dedupKey: `file:${uri.fsPath}`,
    content,
    path: uri.fsPath,
  };
  return [att];
}

async function buildFolderAttachment(uri: vscode.Uri): Promise<Attachment[]> {
  const files: string[] = [];
  const walk = async (dir: vscode.Uri, prefix: string): Promise<void> => {
    if (files.length >= FOLDER_ENTRY_CAP) {
      return;
    }
    const entries = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of entries) {
      if (files.length >= FOLDER_ENTRY_CAP) {
        break;
      }
      const rel = prefix ? `${prefix}/${name}` : name;
      if (type === vscode.FileType.Directory) {
        files.push(`${rel}/`);
        await walk(vscode.Uri.joinPath(dir, name), rel);
      } else {
        files.push(rel);
      }
    }
  };
  await walk(uri, '');
  const listing = files.join('\n');
  const capped =
    files.length >= FOLDER_ENTRY_CAP ? `${listing}\n… (truncated at ${FOLDER_ENTRY_CAP} entries)` : listing;
  const att: FolderAttachment = {
    id: randomUUID(),
    kind: 'folder',
    label: `${path.basename(uri.fsPath)}/`,
    dedupKey: `folder:${uri.fsPath}`,
    content: `Folder ${relPath(uri)} contents:\n${capped}`,
    path: uri.fsPath,
  };
  return sizeGuard(att);
}

interface DiagnosticLikeSource {
  severity: number;
  message: string;
  range: { start: { line: number; character: number } };
  source?: string;
}

async function resolveProblems(): Promise<Attachment[]> {
  const all = vscode.languages.getDiagnostics() as unknown as Array<[vscode.Uri, DiagnosticLikeSource[]]>;
  const entries = all.filter(([, diags]) => diags.length > 0);
  if (entries.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No problems reported in the workspace.'));
    return [];
  }

  const total = entries.reduce((sum, [, d]) => sum + d.length, 0);
  interface ProblemPick extends vscode.QuickPickItem {
    scope: string;
  }
  const items: ProblemPick[] = [
    { label: `$(warning) ${vscode.l10n.t('Workspace')}`, description: `${total}`, scope: 'workspace' },
    ...entries.map(([uri, diags]) => ({ label: relPath(uri), description: `${diags.length}`, scope: uri.fsPath })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: vscode.l10n.t('Select problems to attach'),
  });
  if (!picked) {
    return [];
  }

  const chosen = picked.scope === 'workspace' ? entries : entries.filter(([uri]) => uri.fsPath === picked.scope);
  const fileEntries: DiagnosticFileEntry[] = chosen.map(([uri, diags]) => ({
    path: relPath(uri),
    diagnostics: diags.map((d) => ({
      severity: d.severity,
      message: d.message,
      range: { start: { line: d.range.start.line, character: d.range.start.character } },
      source: d.source,
    })),
  }));
  const label = picked.scope === 'workspace' ? 'workspace' : relPath({ fsPath: picked.scope } as vscode.Uri);
  const att: Attachment = {
    id: randomUUID(),
    kind: 'problems',
    label,
    dedupKey: `problems:${picked.scope}`,
    content: formatDiagnostics(fileEntries),
    scope: picked.scope,
  };
  return sizeGuard(att);
}

interface SymbolSource {
  name: string;
  kind: number;
  containerName?: string;
  location: { uri: vscode.Uri; range: { start: { line: number } } };
}

async function resolveSymbols(): Promise<Attachment[]> {
  const query = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Search workspace symbols'),
    placeHolder: vscode.l10n.t('e.g. MyClass, handleSubmit'),
    ignoreFocusOut: true,
  });
  if (!query) {
    return [];
  }
  const symbols =
    (await vscode.commands.executeCommand<SymbolSource[] | undefined>(
      'vscode.executeWorkspaceSymbolProvider',
      query,
    )) ?? [];
  if (symbols.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No symbols matched "{0}".', query));
    return [];
  }

  interface SymbolPick extends vscode.QuickPickItem {
    index: number;
  }
  const items: SymbolPick[] = symbols.slice(0, 100).map((s, index) => ({
    label: s.name,
    description: `${s.containerName ?? ''} ${relPath(s.location.uri)}`.trim(),
    index,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: vscode.l10n.t('Select symbols to attach'),
  });
  if (!picked || picked.length === 0) {
    return [];
  }

  const chosen: WorkspaceSymbolLike[] = picked.map((p) => {
    const s = symbols[p.index] as SymbolSource;
    return {
      name: s.name,
      kind: s.kind,
      containerName: s.containerName,
      path: relPath(s.location.uri),
      line: s.location.range.start.line,
    };
  });
  const att: Attachment = {
    id: randomUUID(),
    kind: 'symbols',
    label: query,
    dedupKey: `symbols:${query}`,
    content: formatWorkspaceSymbols(chosen),
    query,
  };
  return sizeGuard(att);
}

const DEFAULT_INSTRUCTION_FILES = ['.github/copilot-instructions.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'];

async function resolveInstructions(): Promise<Attachment[]> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage(vscode.l10n.t('No workspace folder is open.'));
    return [];
  }
  const configured = vscode.workspace.getConfiguration('xcsh').get<string[]>('instructionFiles', []) ?? [];
  const candidates = Array.from(new Set([...DEFAULT_INSTRUCTION_FILES, ...configured]));

  interface InstructionPick extends vscode.QuickPickItem {
    sourcePath: string;
    size: number;
  }
  const existing: InstructionPick[] = [];
  for (const rel of candidates) {
    const uri = vscode.Uri.joinPath(folder.uri, rel);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.File) {
        existing.push({ label: rel, sourcePath: uri.fsPath, size: stat.size });
      }
    } catch {
      // Candidate not present — skip.
    }
  }
  if (existing.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No instruction files found in the workspace.'));
    return [];
  }
  const picked = await vscode.window.showQuickPick(existing, {
    placeHolder: vscode.l10n.t('Select an instruction file to attach'),
  });
  if (!picked) {
    return [];
  }
  if (picked.size > MAX_ATTACHMENT_BYTES) {
    void vscode.window.showWarningMessage(
      vscode.l10n.t(
        'File too large to attach ({0}KB). Maximum is {1}KB.',
        Math.round(picked.size / 1024),
        Math.round(MAX_ATTACHMENT_BYTES / 1024),
      ),
    );
    return [];
  }
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(picked.sourcePath));
  const att: Attachment = {
    id: randomUUID(),
    kind: 'instructions',
    label: picked.label,
    dedupKey: `instructions:${picked.sourcePath}`,
    content: new TextDecoder().decode(bytes),
    sourcePath: picked.sourcePath,
  };
  return sizeGuard(att);
}

interface GitChange {
  uri: vscode.Uri;
}
interface GitRepository {
  rootUri: vscode.Uri;
  state: { workingTreeChanges: GitChange[]; indexChanges: GitChange[] };
  diffWithHEAD(path: string): Promise<string>;
}
interface GitExtensionExports {
  getAPI(version: 1): { repositories: GitRepository[] };
}

async function resolveScm(): Promise<Attachment[]> {
  const ext = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!ext) {
    void vscode.window.showWarningMessage(vscode.l10n.t('The built-in Git extension is not available.'));
    return [];
  }
  const exports = ext.isActive ? ext.exports : await ext.activate();
  const repo = exports.getAPI(1).repositories?.[0];
  if (!repo) {
    void vscode.window.showWarningMessage(vscode.l10n.t('No Git repository found in the workspace.'));
    return [];
  }
  const repoRoot = repo.rootUri.fsPath;
  const changed = [...(repo.state.workingTreeChanges ?? []), ...(repo.state.indexChanges ?? [])];

  interface ScmPick extends vscode.QuickPickItem {
    fsPath: string;
  }
  const seen = new Set<string>();
  const items: ScmPick[] = [];
  for (const change of changed) {
    const fsPath = change.uri.fsPath;
    if (seen.has(fsPath)) {
      continue;
    }
    seen.add(fsPath);
    items.push({ label: path.relative(repoRoot, fsPath), fsPath });
  }
  if (items.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No changes in the working tree.'));
    return [];
  }
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: vscode.l10n.t('Select changed files to attach'),
  });
  if (!picked || picked.length === 0) {
    return [];
  }
  const blocks: string[] = [];
  for (const p of picked) {
    let diff: string;
    try {
      diff = await repo.diffWithHEAD(p.fsPath);
    } catch {
      diff = '';
    }
    blocks.push(`# ${p.label}\n${diff}`.trimEnd());
  }
  const att: Attachment = {
    id: randomUUID(),
    kind: 'scm',
    label: picked.length === 1 ? (picked[0]?.label ?? 'changes') : `${picked.length} changed files`,
    dedupKey: `scm:${repoRoot}`,
    content: blocks.join('\n\n'),
    repoRoot,
  };
  return sizeGuard(att);
}
