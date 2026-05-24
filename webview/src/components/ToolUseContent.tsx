// webview/src/components/ToolUseContent.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useState } from 'react';
import type { ToolUseBlock } from '../state/session';

interface ToolUseContentProps {
  block: ToolUseBlock;
}

export function ToolUseContent({ block }: ToolUseContentProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="toolUse">
      <div className="toolSummary">
        <span className="toolName">{block.toolName}</span>
        {block.running && <span className="toolRunning">...</span>}
      </div>
      <div className="toolBody">
        {block.input && (
          <div className="toolRow">
            <div className="toolRowLabel">IN</div>
            <div className="toolRowContent">
              <pre>{block.input}</pre>
            </div>
            <button className="toolCopyBtn" type="button" onClick={() => handleCopy(block.input ?? '')}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        {block.output && (
          <div className="toolRow">
            <div className="toolRowLabel">OUT</div>
            <div className="toolRowContent">
              <pre>{block.output}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
