// webview/src/components/AttachMenu.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Category dropdown opened by the composer "+" button — the XCSH parity of the
// built-in chat attachment picker. Follows the SlashCommandMenu popover pattern
// (absolutely-positioned menu, click-outside handled by the parent). Only
// categories that are implemented this phase are listed.

import { t } from '../lib/i18n';
import type { HostAttachmentCategory } from '../lib/protocol';

interface AttachCategory {
  id: HostAttachmentCategory;
  label: () => string;
  description: () => string;
}

const CATEGORIES: AttachCategory[] = [
  { id: 'files', label: () => t('Files & Folders'), description: () => t('Attach workspace files or folders') },
  { id: 'instructions', label: () => t('Instructions'), description: () => t('Attach an instruction file') },
  { id: 'scm', label: () => t('Source Control'), description: () => t('Attach changed-file diffs') },
  { id: 'problems', label: () => t('Problems'), description: () => t('Attach workspace diagnostics') },
  { id: 'symbols', label: () => t('Symbols'), description: () => t('Search and attach workspace symbols') },
];

interface AttachMenuProps {
  onSelect: (category: HostAttachmentCategory) => void;
  onClose: () => void;
}

export function AttachMenu({ onSelect, onClose }: AttachMenuProps) {
  return (
    <div className="slashMenu" role="menu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {CATEGORIES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="slashMenuItem"
          onClick={() => {
            onSelect(item.id);
            onClose();
          }}
        >
          <span className="slashMenuCommand">{item.label()}</span>
          <span className="slashMenuDescription">{item.description()}</span>
        </button>
      ))}
    </div>
  );
}
