// webview/src/components/ModesMenu.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { t } from '../lib/i18n';

const MODES = [
  { id: 'auto', label: () => t('Auto'), description: () => t('xcsh runs tools automatically') },
  {
    id: 'confirm',
    label: () => t('Confirm tools'),
    description: () => t('Preference hint: ask before tool execution'),
  },
  {
    id: 'readonly',
    label: () => t('Read-only'),
    description: () => t('Preference hint: suggest read-only operations'),
  },
] as const;

const THINKING_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const;

interface ModesMenuProps {
  currentMode: string;
  onSelect: (mode: string) => void;
  onClose: () => void;
  thinkingLevel: string;
  onThinkingChange: (level: string) => void;
}

export function ModesMenu({ currentMode, onSelect, onClose, thinkingLevel, onThinkingChange }: ModesMenuProps) {
  return (
    <div className="modesMenu" role="menu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="modesHeader">
        <span className="modesTitle">{t('Modes')}</span>
        <span className="modesHint">
          <kbd>Shift</kbd> + <kbd>Tab</kbd> to switch
        </span>
      </div>
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`modeItem ${mode.id === currentMode ? 'selected' : ''}`}
          onClick={() => {
            onSelect(mode.id);
            onClose();
          }}
        >
          <span className="modeLabel">{mode.label()}</span>
          <span className="modeDescription">{mode.description()}</span>
        </button>
      ))}
      <div className="modesDivider" />
      <div className="thinkingSection">
        <span className="thinkingLabel">{t('Thinking level')}</span>
        <div className="thinkingLevels">
          {THINKING_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`thinkingLevelBtn ${level === thinkingLevel ? 'active' : ''}`}
              onClick={() => onThinkingChange(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
