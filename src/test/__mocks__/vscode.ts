// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * VSCode API mock for Jest unit tests
 * This mock provides basic implementations of VSCode APIs used by the extension
 */

// Mock EventEmitter
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
          this.listeners.splice(index, 1);
        }
      },
    };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

// Mock Uri
export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    path,
    scheme: 'file',
    authority: '',
    query: '',
    fragment: '',
    with: jest.fn(),
    toString: () => `file://${path}`,
  }),
  parse: (value: string) => ({
    fsPath: value,
    path: value,
    scheme: 'file',
    authority: '',
    query: '',
    fragment: '',
    with: jest.fn(),
    toString: () => value,
  }),
  joinPath: (base: { fsPath: string }, ...pathSegments: string[]) => {
    const fullPath = [base.fsPath, ...pathSegments].join('/');
    return Uri.file(fullPath);
  },
};

// Mock TreeItem
export class TreeItem {
  label?: string | { label: string };
  id?: string;
  iconPath?: string | { light: string; dark: string };
  description?: string;
  tooltip?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  contextValue?: string;
  collapsibleState?: TreeItemCollapsibleState;
  resourceUri?: typeof Uri;

  constructor(label: string | { label: string }, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// Mock TreeItemCollapsibleState
export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

// Mock ThemeIcon
export class ThemeIcon {
  static readonly File = new ThemeIcon('file');
  static readonly Folder = new ThemeIcon('folder');

  constructor(
    public readonly id: string,
    public readonly color?: ThemeColor,
  ) {}
}

// Mock ThemeColor
export class ThemeColor {
  constructor(public readonly id: string) {}
}

// Mock SecretStorage
export const mockSecretStorage = {
  get: jest.fn(),
  store: jest.fn(),
  delete: jest.fn(),
  onDidChange: jest.fn(),
};

// Mock Memento (globalState/workspaceState)
export const mockMemento = {
  get: jest.fn(),
  update: jest.fn(),
  keys: jest.fn(() => []),
};

// Mock ExtensionContext
export const mockExtensionContext = {
  subscriptions: [],
  workspaceState: mockMemento,
  globalState: { ...mockMemento, setKeysForSync: jest.fn() },
  secrets: mockSecretStorage,
  extensionUri: Uri.file('/mock/extension'),
  extensionPath: '/mock/extension',
  storagePath: '/mock/storage',
  globalStoragePath: '/mock/global-storage',
  logPath: '/mock/log',
  extensionMode: 1,
  environmentVariableCollection: {
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  },
  asAbsolutePath: (relativePath: string) => `/mock/extension/${relativePath}`,
};

// Mock window
export const window = {
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
  createTreeView: jest.fn(() => ({
    reveal: jest.fn(),
    dispose: jest.fn(),
    onDidChangeSelection: jest.fn(),
    onDidChangeVisibility: jest.fn(),
    onDidCollapseElement: jest.fn(),
    onDidExpandElement: jest.fn(),
  })),
  registerTreeDataProvider: jest.fn(),
  withProgress: jest.fn((_options, task) => task({ report: jest.fn() }, { isCancellationRequested: false })),
  activeTextEditor: undefined,
  visibleTextEditors: [],
  onDidChangeActiveTextEditor: jest.fn(),
  createTextEditorDecorationType: jest.fn(() => ({
    dispose: jest.fn(),
  })),
  showTextDocument: jest.fn(),
  createStatusBarItem: jest.fn((_alignment?: StatusBarAlignment, _priority?: number) => new MockStatusBarItem()),
  onDidChangeTextEditorSelection: jest.fn(() => ({ dispose: jest.fn() })),
};

// Mock workspace
export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    has: jest.fn(),
    inspect: jest.fn(),
    update: jest.fn(),
  })),
  workspaceFolders: [],
  onDidChangeConfiguration: jest.fn(),
  openTextDocument: jest.fn(),
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    delete: jest.fn(),
    createDirectory: jest.fn(),
    readDirectory: jest.fn(),
    stat: jest.fn(),
  },
  applyEdit: jest.fn().mockResolvedValue(true),
};

// Mock commands
export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
  getCommands: jest.fn(),
};

// Mock extensions
export const extensions = {
  getExtension: jest.fn().mockReturnValue(undefined),
};

// Mock ExtensionKind
export enum ExtensionKind {
  UI = 1,
  Workspace = 2,
}

// Mock env
export const env = {
  clipboard: {
    readText: jest.fn(),
    writeText: jest.fn(),
  },
  openExternal: jest.fn(),
  uriScheme: 'vscode',
  language: 'en',
  machineId: 'mock-machine-id',
  sessionId: 'mock-session-id',
  appName: 'Visual Studio Code',
  appRoot: '/mock/app',
};

// Mock ProgressLocation
export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

// Mock ConfigurationTarget
export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

// Mock Disposable
export class Disposable {
  constructor(private callOnDispose: () => void) {}

  static from(...disposables: { dispose: () => void }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }

  dispose(): void {
    this.callOnDispose();
  }
}

// Mock CancellationTokenSource
export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(),
  };

  cancel(): void {
    this.token.isCancellationRequested = true;
  }

  dispose(): void {}
}

// Mock Range and Position
export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}

  isAfter(other: Position): boolean {
    return this.line > other.line || (this.line === other.line && this.character > other.character);
  }

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  translate(lineDelta?: number, characterDelta?: number): Position {
    return new Position(this.line + (lineDelta || 0), this.character + (characterDelta || 0));
  }

  with(line?: number, character?: number): Position {
    return new Position(line ?? this.line, character ?? this.character);
  }
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  get isSingleLine(): boolean {
    return this.start.line === this.end.line;
  }

  contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Position) {
      return !positionOrRange.isBefore(this.start) && !positionOrRange.isAfter(this.end);
    }
    return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
  }
}

// Mock LanguageModelTextPart
export class LanguageModelTextPart {
  constructor(public readonly value: string) {}
}

// Mock CompletionItemKind
export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  EnumMember = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
}

// Mock CompletionItem
export class CompletionItem {
  insertText?: string | SnippetString;
  documentation?: string | MarkdownString;
  sortText?: string;
  detail?: string;
  kind?: CompletionItemKind;

  constructor(
    public label: string | { label: string },
    kind?: CompletionItemKind,
  ) {
    this.kind = kind;
  }
}

// Mock CompletionList
export class CompletionList {
  constructor(
    public items: CompletionItem[] = [],
    public isIncomplete = false,
  ) {}
}

// Mock SnippetString
export class SnippetString {
  constructor(public value: string = '') {}
}

// Mock InlineCompletionItem
export class InlineCompletionItem {
  constructor(
    public insertText: string | SnippetString,
    public range?: Range,
  ) {}
}

// Mock InlineCompletionList
export class InlineCompletionList {
  constructor(public items: InlineCompletionItem[] = []) {}
}

// Mock LanguageModelToolCallPart
export class LanguageModelToolCallPart {
  constructor(
    public readonly callId: string,
    public readonly name: string,
    public readonly input: unknown,
  ) {}
}

// Mock Hover
export class Hover {
  constructor(
    public readonly contents: MarkdownString | MarkdownString[],
    public readonly range?: Range,
  ) {}
}

// Mock LanguageModelToolResultPart
export class LanguageModelToolResultPart {
  constructor(
    public readonly callId: string,
    public readonly content: unknown[],
  ) {}
}

// Mock LanguageModelToolResult
export class LanguageModelToolResult {
  constructor(public readonly content: unknown[]) {}
}

// Mock LanguageModelChatMessageRole
export enum LanguageModelChatMessageRole {
  User = 1,
  Assistant = 2,
}

// Mock languages
export const languages = {
  getDiagnostics: jest.fn(() => []),
  registerCompletionItemProvider: jest.fn(),
  registerHoverProvider: jest.fn(),
  createDiagnosticCollection: jest.fn(() => ({
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
  })),
  onDidChangeDiagnostics: jest.fn(() => ({ dispose: jest.fn() })),
};

// Mock lm namespace
export const lm = {
  registerTool: jest.fn(() => ({ dispose: jest.fn() })),
  registerLanguageModelChatProvider: jest.fn(() => ({ dispose: jest.fn() })),
  tools: [],
};

// Mock l10n namespace — passthrough returns the English string with positional args interpolated
export const l10n = {
  t: jest.fn((message: string, ...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      const params = args[0] as Record<string, unknown>;
      return message.replace(/\{(\w+)\}/g, (match, key: string) => {
        const val = params[key];
        return val !== undefined ? String(val) : match;
      });
    }
    let result = message;
    for (let i = 0; i < args.length; i++) {
      result = result.replace(`{${i}}`, String(args[i]));
    }
    return result;
  }),
  bundle: undefined,
  uri: undefined,
};

// Mock chat namespace
export const chat = {
  createChatParticipant: jest.fn(() => ({
    iconPath: undefined,
    followupProvider: undefined,
    onDidReceiveFeedback: jest.fn(() => ({ dispose: jest.fn() })),
    dispose: jest.fn(),
  })),
};

// Mock DiagnosticSeverity
export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

// Mock Diagnostic
export class Diagnostic {
  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

// Mock CodeActionTriggerKind
export enum CodeActionTriggerKind {
  Invoke = 1,
  Automatic = 2,
}

// Mock CodeActionKind
export class CodeActionKind {
  static readonly QuickFix = new CodeActionKind('quickfix');
  static readonly Refactor = new CodeActionKind('refactor');
  constructor(public readonly value: string) {}
}

// Mock CodeAction
export class CodeAction {
  edit?: WorkspaceEdit;
  diagnostics?: Diagnostic[];
  kind?: CodeActionKind;
  constructor(
    public readonly title: string,
    kind?: CodeActionKind,
  ) {
    this.kind = kind;
  }
}

// Mock SymbolKind
export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

// Mock Location
export class Location {
  constructor(
    public readonly uri: ReturnType<typeof Uri.file>,
    public readonly range: Range,
  ) {}
}

// Mock StatusBarAlignment
export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

// Mock MockStatusBarItem
export class MockStatusBarItem {
  text = '';
  tooltip: string | undefined = undefined;
  alignment = StatusBarAlignment.Left;
  priority: number | undefined = undefined;
  visible = false;
  show = jest.fn(() => {
    this.visible = true;
  });
  hide = jest.fn(() => {
    this.visible = false;
  });
  dispose = jest.fn();
}

// Mock WorkspaceEdit
export class WorkspaceEdit {
  private edits: Array<{ uri: ReturnType<typeof Uri.file>; range: Range; newText: string }> = [];
  replace(uri: ReturnType<typeof Uri.file>, range: Range, newText: string): void {
    this.edits.push({ uri, range, newText });
  }
  delete(uri: ReturnType<typeof Uri.file>, range: Range): void {
    this.edits.push({ uri, range, newText: '' });
  }
  entries(): Array<[ReturnType<typeof Uri.file>, Array<{ range: Range; newText: string }>]> {
    const grouped = new Map<string, Array<{ range: Range; newText: string }>>();
    for (const edit of this.edits) {
      const key = edit.uri.fsPath;
      const group = grouped.get(key) ?? [];
      group.push({ range: edit.range, newText: edit.newText });
      grouped.set(key, group);
    }
    return Array.from(grouped.entries()).map(([path, edits]) => [Uri.file(path), edits]);
  }
}

// Mock MarkdownString
export class MarkdownString {
  value: string;
  isTrusted?: boolean;
  supportThemeIcons?: boolean;
  constructor(value?: string) {
    this.value = value ?? '';
  }
  appendText(text: string): this {
    this.value += text;
    return this;
  }
  appendMarkdown(markdown: string): this {
    this.value += markdown;
    return this;
  }
}

// Export default for CommonJS compatibility
export default {
  EventEmitter,
  Uri,
  TreeItem,
  TreeItemCollapsibleState,
  ThemeIcon,
  ThemeColor,
  window,
  workspace,
  commands,
  env,
  ProgressLocation,
  ConfigurationTarget,
  Disposable,
  CancellationTokenSource,
  Position,
  Range,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
  LanguageModelToolResult,
  LanguageModelChatMessageRole,
  l10n,
  languages,
  lm,
  chat,
  DiagnosticSeverity,
  MarkdownString,
  SymbolKind,
  Location,
  StatusBarAlignment,
  MockStatusBarItem,
  WorkspaceEdit,
};
