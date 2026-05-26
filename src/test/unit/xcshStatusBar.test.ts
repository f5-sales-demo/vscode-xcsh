// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import { createXcshStatusBar } from '../../xcsh/statusBar';

describe('xcshStatusBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a status bar item', () => {
    const disposables: vscode.Disposable[] = [];
    createXcshStatusBar(disposables);
    expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
    expect(disposables.length).toBeGreaterThan(0);
  });

  it('shows the status bar item', () => {
    const disposables: vscode.Disposable[] = [];
    const item = createXcshStatusBar(disposables);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(item.show).toHaveBeenCalled();
  });

  it('sets initial text when no active editor', () => {
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = undefined;
    const disposables: vscode.Disposable[] = [];
    const item = createXcshStatusBar(disposables);
    expect(item.text).toBe('xcsh');
  });
});
