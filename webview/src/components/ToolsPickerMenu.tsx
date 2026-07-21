// webview/src/components/ToolsPickerMenu.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Multi-select popover for the "Tools" attachment category. Lists the host tools
// delivered via `tools_available`; confirming attaches the chosen tool names.

import { useState } from 'react';
import { t } from '../lib/i18n';
import type { ToolInfo } from '../lib/protocol';

interface ToolsPickerMenuProps {
  tools: ToolInfo[];
  onConfirm: (names: string[]) => void;
  onClose: () => void;
}

export function ToolsPickerMenu({ tools, onConfirm, onClose }: ToolsPickerMenuProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  return (
    <div
      className="slashMenu toolsPickerMenu"
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {tools.length === 0 ? (
        <div className="toolsPickerEmpty">{t('No tools available')}</div>
      ) : (
        <>
          {tools.map((tool) => {
            const isSelected = selected.has(tool.name);
            return (
              <button
                key={tool.name}
                type="button"
                className={`slashMenuItem toolItem${isSelected ? ' toolItemSelected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => toggle(tool.name)}
              >
                <span className="toolItemIndicator">{isSelected ? '✓' : '○'}</span>
                <span className="slashMenuCommand">{tool.label}</span>
                <span className="slashMenuDescription">{tool.description}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="toolsPickerConfirm"
            disabled={selected.size === 0}
            onClick={() => {
              onConfirm(Array.from(selected));
              onClose();
            }}
          >
            {t('Attach')} ({selected.size})
          </button>
        </>
      )}
    </div>
  );
}
