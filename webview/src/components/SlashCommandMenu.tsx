// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
// webview/src/components/SlashCommandMenu.tsx

const COMMANDS = [
  { command: '/status', label: 'Status', description: 'Show integration health' },
  { command: '/context', label: 'Context', description: 'Show active xcsh context' },
  { command: '/resources', label: 'Resources', description: 'Browse current namespace' },
];

interface SlashCommandMenuProps {
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function SlashCommandMenu({ onSelect, onClose }: SlashCommandMenuProps) {
  return (
    <div className="slashMenu" role="menu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {COMMANDS.map((item) => (
        <button
          key={item.command}
          type="button"
          className="slashMenuItem"
          onClick={() => {
            onSelect(item.command);
            onClose();
          }}
        >
          <span className="slashMenuCommand">{item.command}</span>
          <span className="slashMenuDescription">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
