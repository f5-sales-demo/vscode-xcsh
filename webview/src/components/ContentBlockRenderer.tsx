// webview/src/components/ContentBlockRenderer.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { ContentBlock } from '../state/session';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolUseContent } from './ToolUseContent';

interface ContentBlockRendererProps {
  block: ContentBlock;
  isLast: boolean;
  busy: boolean;
}

export function ContentBlockRenderer({ block, isLast, busy }: ContentBlockRendererProps) {
  switch (block.type) {
    case 'text':
      return (
        <span className="markdownRoot">
          <MarkdownRenderer text={block.text} />
        </span>
      );
    case 'tool_use':
      return <ToolUseContent block={block} />;
    case 'thinking':
      return (
        <ThinkingBlock
          thinking={block.thinking}
          isCurrentlyThinking={isLast && busy && !block.thinking}
          durationMs={block.durationMs}
        />
      );
    default:
      return null;
  }
}
