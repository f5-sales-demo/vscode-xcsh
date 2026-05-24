// webview/src/components/MarkdownRenderer.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';

marked.setOptions({ gfm: true, breaks: true });

interface MarkdownRendererProps {
  text: string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  const html = useMemo(() => {
    const raw = marked.parse(text) as string;
    return DOMPurify.sanitize(raw);
  }, [text]);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized with DOMPurify
  return <span className="markdownRoot" dangerouslySetInnerHTML={{ __html: html }} />;
}
