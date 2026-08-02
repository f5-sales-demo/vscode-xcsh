// src/xcsh/attachmentTypes.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Host-side mirror of the webview attachment model (`webview/src/lib/attachmentTypes.ts`).
// The extension and webview are separate build units, so these shapes are
// duplicated by convention (as with `ExtensionMessage`). Host resolvers build
// these objects and post them to the webview as `attachment_added` messages;
// the webview owns serialization into prompt text. The byte cap lives in
// `./attachment` (`MAX_ATTACHMENT_BYTES`) and is reused by resolvers directly.

type AttachmentKind = 'file' | 'folder' | 'instructions' | 'scm' | 'problems' | 'symbols' | 'sessions' | 'tools';

interface BaseAttachment {
  id: string;
  kind: AttachmentKind;
  label: string;
  dedupKey: string;
  content: string;
}

export interface FileAttachment extends BaseAttachment {
  kind: 'file';
  path: string;
}
export interface FolderAttachment extends BaseAttachment {
  kind: 'folder';
  path: string;
}
interface InstructionsAttachment extends BaseAttachment {
  kind: 'instructions';
  sourcePath: string;
}
interface ScmAttachment extends BaseAttachment {
  kind: 'scm';
  repoRoot: string;
}
interface ProblemsAttachment extends BaseAttachment {
  kind: 'problems';
  scope: string;
}
interface SymbolsAttachment extends BaseAttachment {
  kind: 'symbols';
  query: string;
}
interface SessionsAttachment extends BaseAttachment {
  kind: 'sessions';
  sessionId: string;
}
interface ToolsAttachment extends BaseAttachment {
  kind: 'tools';
  toolNames: string[];
}

export type Attachment =
  | FileAttachment
  | FolderAttachment
  | InstructionsAttachment
  | ScmAttachment
  | ProblemsAttachment
  | SymbolsAttachment
  | SessionsAttachment
  | ToolsAttachment;

/** Categories resolved on the host (webview posts `request_attachment`). */
export type HostAttachmentCategory = 'files' | 'instructions' | 'scm' | 'problems' | 'symbols';
