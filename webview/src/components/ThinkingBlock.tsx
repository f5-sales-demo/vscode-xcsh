// webview/src/components/ThinkingBlock.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ThinkingBlockProps {
  thinking: string;
  isCurrentlyThinking: boolean;
  durationMs?: number;
}

export function ThinkingBlock({ thinking, isCurrentlyThinking, durationMs }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasContent = thinking.length > 0;

  const durationText = durationMs
    ? `Thought for ${(durationMs / 1000).toFixed(0)}s`
    : isCurrentlyThinking
      ? 'Thinking...'
      : 'Thinking';

  return (
    <details className="thinkingBlock" open={isOpen} onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="thinkingSummary">
        <span className={`thinkingToggle ${isOpen ? 'open' : ''}`}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
        <span>{durationText}</span>
      </summary>
      {hasContent && (
        <div className="thinkingContent">
          <MarkdownRenderer text={thinking} />
        </div>
      )}
    </details>
  );
}
