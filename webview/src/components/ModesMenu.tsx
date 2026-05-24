// webview/src/components/ModesMenu.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const MODES = [
  { id: 'auto', label: 'Auto', description: 'xcsh runs tools automatically' },
  { id: 'confirm', label: 'Confirm tools', description: 'Ask before tool execution' },
  { id: 'readonly', label: 'Read-only', description: 'No write operations' },
] as const;

const THINKING_LEVELS = ['low', 'medium', 'high', 'max'] as const;

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
        <span className="modesTitle">Modes</span>
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
          <span className="modeLabel">{mode.label}</span>
          <span className="modeDescription">{mode.description}</span>
        </button>
      ))}
      <div className="modesDivider" />
      <div className="thinkingSection">
        <span className="thinkingLabel">Thinking level</span>
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
