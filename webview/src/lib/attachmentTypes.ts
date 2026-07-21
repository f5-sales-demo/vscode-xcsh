// webview/src/lib/attachmentTypes.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Typed, multi-attachment model for the chat composer. This mirrors the
// host-side definitions in `src/xcsh/attachmentTypes.ts` (the extension and
// webview are separate build units, so shared shapes are duplicated — the same
// convention used for `ExtensionMessage`). Every attachment carries a `content`
// string; the backend agent is text-only, so attachments serialize to labeled
// text blocks that are prepended to the user's message on submit.

export type AttachmentKind = 'file' | 'folder' | 'instructions' | 'scm' | 'problems' | 'symbols' | 'sessions' | 'tools';

export interface BaseAttachment {
  /** Stable unique id for React keys and removal. */
  id: string;
  kind: AttachmentKind;
  /** Human-readable chip label. */
  label: string;
  /** Identity used to reject duplicate attachments. */
  dedupKey: string;
  /** Text folded into the next prompt. */
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
export interface InstructionsAttachment extends BaseAttachment {
  kind: 'instructions';
  sourcePath: string;
}
export interface ScmAttachment extends BaseAttachment {
  kind: 'scm';
  repoRoot: string;
}
export interface ProblemsAttachment extends BaseAttachment {
  kind: 'problems';
  /** 'workspace' or a file path. */
  scope: string;
}
export interface SymbolsAttachment extends BaseAttachment {
  kind: 'symbols';
  query: string;
}
export interface SessionsAttachment extends BaseAttachment {
  kind: 'sessions';
  sessionId: string;
}
export interface ToolsAttachment extends BaseAttachment {
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

/** Mirror of `MAX_ATTACHMENT_BYTES` in `src/xcsh/attachment.ts` (512 KB). */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;

const KIND_LABEL: Record<AttachmentKind, string> = {
  file: 'File',
  folder: 'Folder',
  instructions: 'Instructions',
  scm: 'Source Control',
  problems: 'Problems',
  symbols: 'Symbols',
  sessions: 'Session',
  tools: 'Tools',
};

/** UTF-8 byte length, matching the host's `Buffer.byteLength(s, 'utf8')`. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Render one attachment as a labeled text block for the prompt. */
export function serializeAttachment(a: Attachment): string {
  return `[${KIND_LABEL[a.kind]}: ${a.label}]\n\n${a.content}`;
}

/** Join all attachments into the prefix prepended to the user's message. */
export function serializeAttachments(list: Attachment[]): string {
  return list.map(serializeAttachment).join('\n\n');
}

export interface AddResult {
  list: Attachment[];
  added: boolean;
  reason?: 'duplicate' | 'budget';
}

/**
 * Return a new list with `incoming` appended, unless it duplicates an existing
 * `dedupKey` or would push the combined content past `MAX_ATTACHMENT_BYTES`.
 * On rejection the original list reference is returned unchanged.
 */
export function addAttachment(list: Attachment[], incoming: Attachment): AddResult {
  if (list.some((a) => a.dedupKey === incoming.dedupKey)) {
    return { list, added: false, reason: 'duplicate' };
  }
  const currentBytes = list.reduce((sum, a) => sum + byteLength(a.content), 0);
  if (currentBytes + byteLength(incoming.content) > MAX_ATTACHMENT_BYTES) {
    return { list, added: false, reason: 'budget' };
  }
  return { list: [...list, incoming], added: true };
}
