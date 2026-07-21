// webview/src/__tests__/attachmentTypes.test.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { FileAttachment, ProblemsAttachment } from '../lib/attachmentTypes';
import { addAttachment, MAX_ATTACHMENT_BYTES, serializeAttachment, serializeAttachments } from '../lib/attachmentTypes';

function file(path: string, content = 'x'): FileAttachment {
  return { id: path, kind: 'file', label: path, dedupKey: `file:${path}`, content, path };
}

describe('attachmentTypes serialization', () => {
  it('serializes a file attachment as a labeled block', () => {
    expect(serializeAttachment(file('a.ts', 'hello'))).toBe('[File: a.ts]\n\nhello');
  });

  it('uses a per-kind label prefix', () => {
    const p: ProblemsAttachment = {
      id: 'p1',
      kind: 'problems',
      label: 'workspace',
      dedupKey: 'problems:workspace',
      content: '2 errors',
      scope: 'workspace',
    };
    expect(serializeAttachment(p)).toBe('[Problems: workspace]\n\n2 errors');
  });

  it('joins multiple attachments with a blank line', () => {
    const out = serializeAttachments([file('a.ts', 'A'), file('b.ts', 'B')]);
    expect(out).toBe('[File: a.ts]\n\nA\n\n[File: b.ts]\n\nB');
  });

  it('returns an empty string for no attachments', () => {
    expect(serializeAttachments([])).toBe('');
  });
});

describe('addAttachment', () => {
  it('adds a unique attachment', () => {
    const r = addAttachment([], file('a.ts'));
    expect(r.added).toBe(true);
    expect(r.list).toHaveLength(1);
  });

  it('de-dupes by dedupKey (keeps the original list)', () => {
    const start = [file('a.ts')];
    const r = addAttachment(start, file('a.ts'));
    expect(r.added).toBe(false);
    expect(r.reason).toBe('duplicate');
    expect(r.list).toBe(start);
  });

  it('rejects an attachment that alone exceeds the byte budget', () => {
    const big = file('big.ts', 'x'.repeat(MAX_ATTACHMENT_BYTES + 1));
    const r = addAttachment([], big);
    expect(r.added).toBe(false);
    expect(r.reason).toBe('budget');
  });

  it('rejects when the running total would exceed the budget', () => {
    const half = 'x'.repeat(Math.floor(MAX_ATTACHMENT_BYTES * 0.6));
    const r1 = addAttachment([], file('a.ts', half));
    expect(r1.added).toBe(true);
    const r2 = addAttachment(r1.list, file('b.ts', half));
    expect(r2.added).toBe(false);
    expect(r2.reason).toBe('budget');
  });

  it('accepts multiple attachments under the budget', () => {
    const r1 = addAttachment([], file('a.ts', 'x'.repeat(1000)));
    const r2 = addAttachment(r1.list, file('b.ts', 'y'.repeat(1000)));
    expect(r2.added).toBe(true);
    expect(r2.list).toHaveLength(2);
  });
});
