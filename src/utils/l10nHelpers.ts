// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';

export function getLocalizedDisplayName(displayName: string): string {
  return vscode.l10n.t(displayName);
}
