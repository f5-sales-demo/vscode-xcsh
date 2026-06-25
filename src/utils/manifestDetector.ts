import * as vscode from 'vscode';
import { RESOURCE_TYPES } from '../api/resourceTypes';
import { getLogger } from './logger';

const logger = getLogger();

function tryParseJson(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON
  }
  return undefined;
}

function tryParseYaml(content: string): Record<string, unknown> | undefined {
  try {
    const lines = content.split('\n');
    let kind: string | undefined;
    let metadataName: string | undefined;
    let inMetadata = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '' || trimmed === '---') {
        continue;
      }

      if (trimmed.startsWith('kind:')) {
        kind = trimmed
          .slice(5)
          .trim()
          .replace(/^['"]|['"]$/g, '');
      }

      if (trimmed === 'metadata:') {
        inMetadata = true;
        continue;
      }

      if (inMetadata && trimmed.startsWith('name:')) {
        metadataName = trimmed
          .slice(5)
          .trim()
          .replace(/^['"]|['"]$/g, '');
      }

      if (inMetadata && !line.startsWith(' ') && !line.startsWith('\t') && trimmed !== '') {
        inMetadata = false;
      }
    }

    if (kind && metadataName) {
      return { kind, metadata: { name: metadataName } };
    }
  } catch {
    // Not valid YAML
  }
  return undefined;
}

export function isXCManifest(content: string): boolean {
  const parsed = tryParseJson(content) ?? tryParseYaml(content);
  if (!parsed) {
    return false;
  }

  const { kind, metadata } = parsed;
  if (typeof kind !== 'string' || !kind) {
    return false;
  }
  if (RESOURCE_TYPES[kind] === undefined) {
    return false;
  }

  if (typeof metadata !== 'object' || metadata === null) {
    return false;
  }
  const meta = metadata as Record<string, unknown>;
  return typeof meta.name === 'string' && meta.name.length > 0;
}

export function getManifestKind(content: string): string | undefined {
  const parsed = tryParseJson(content) ?? tryParseYaml(content);
  if (!parsed) {
    return undefined;
  }

  const { kind } = parsed;
  if (typeof kind !== 'string' || !kind) {
    return undefined;
  }
  if (RESOURCE_TYPES[kind] === undefined) {
    return undefined;
  }
  return kind;
}

export class ManifestDetector implements vscode.Disposable {
  readonly #disposables: vscode.Disposable[] = [];

  constructor() {
    this.#disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.#updateContext(editor?.document);
      }),
    );

    this.#disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (vscode.window.activeTextEditor?.document === document) {
          this.#updateContext(document);
        }
      }),
    );

    this.#disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (vscode.window.activeTextEditor?.document === event.document) {
          this.#updateContext(event.document);
        }
      }),
    );

    this.#updateContext(vscode.window.activeTextEditor?.document);
  }

  #updateContext(document: vscode.TextDocument | undefined): void {
    if (!document) {
      void vscode.commands.executeCommand('setContext', 'xcsh.isManifestFile', false);
      return;
    }

    const languageId = document.languageId;
    if (languageId !== 'json' && languageId !== 'jsonc' && languageId !== 'yaml') {
      void vscode.commands.executeCommand('setContext', 'xcsh.isManifestFile', false);
      return;
    }

    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      void vscode.commands.executeCommand('setContext', 'xcsh.isManifestFile', false);
      return;
    }

    const content = document.getText();
    const isManifest = isXCManifest(content);
    void vscode.commands.executeCommand('setContext', 'xcsh.isManifestFile', isManifest);

    if (isManifest) {
      logger.debug(`Detected XC manifest: ${document.uri.fsPath}`);
    }
  }

  dispose(): void {
    for (const d of this.#disposables) {
      d.dispose();
    }
  }
}
