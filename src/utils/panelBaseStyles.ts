const F5_LOGO_LINES = [
  '                   ________',
  '              (▒▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒)',
  '         (▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒)',
  '      (▒▒▓▓▓▓██████████▓▓▓▓█████████████)',
  '    (▒▓▓▓▓██████▒▒▒▒▒███▓▓██████████████▒)',
  '   (▒▓▓▓▓██████▒▓▓▓▓▓▒▒▒▓██▒▒▒▒▒▒▒▒▒▒▒▒▒▓▒)',
  '  (▒▓▓▓▓▓██████▓▓▓▓▓▓▓▓▓██▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒)',
  ' (▒▓▓███████████████▓▓▓▓█████████████▓▓▓▓▓▓▒)',
  '(▒▓▓▓▒▒▒███████▒▒▒▒▒▓▓▓████████████████▓▓▓▓▓▒)',
  '|▒▓▓▓▓▓▓▒██████▓▓▓▓▓▓▓████████████████████▓▓▒|',
  '|▒▓▓▓▓▓▓▓██████▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒██████████▓▒|',
  '(▒▓▓▓▓▓▓▓██████▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒████████▒▒)',
  ' (▒▓▓▓▓▓▓██████▓▓▓▓▓▓▓███▓▓▓▓▓▓▓▓▓▓▒▒▒████▒▒)',
  '  (▒▓▓▓▓▓██████▓▓▓▓▓▓█████▓▓▓▓▓▓▓▓▓▓▓▓███▒▒)',
  '   (▒▒██████████▓▓▓▓▓▒██████▓▓▓▓▓▓▓▓███▒▒▒)',
  '    (▒▒▒▒▒██████████▓▓▒▒█████████████▒▒▓▒)',
  '      (▒▓▓▒▒▒▒▒▒▒▒▒▒▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▓▒)',
  '         (▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒)',
  '              (▒▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒)',
];

function colorCharHtml(char: string): string {
  if (char === '▓') {
    return '<span class="f5r">█</span>';
  }
  if (char === '█') {
    return '<span class="f5w">█</span>';
  }
  if (char === '▒') {
    return '<span class="f5s">▒</span>';
  }
  if ('()|_'.includes(char)) {
    return `<span class="f5r">${char}</span>`;
  }
  return char;
}

export function getF5LogoHtml(): string {
  const lines = F5_LOGO_LINES.map((line) => `<div class="f5l">${[...line].map(colorCharHtml).join('')}</div>`).join('');
  return `<div class="toolbar-logo-wrap"><pre class="toolbar-logo" role="img" aria-label="F5 logo">${lines}</pre></div>`;
}

export function getWebviewBaseStyles(): string {
  return `
    :root {
      --f5-brand-red: #e01f27;
      --f5-brand-red-dark: #8b0000;
    }
    body.vscode-light {
      --color-brand: #e4002b;
      --color-N600: #0f1e57;
      --color-N200: #e6e9f3;
      --color-blue-light: #e5eaff;
    }
    body.vscode-dark, body.vscode-high-contrast {
      --color-brand: #ff4d6a;
      --color-N600: #b8c2e0;
      --color-N200: #2d3459;
      --color-blue-light: #2d3868;
    }

    body::after {
      content: '';
      position: fixed;
      inset: 0;
      border: 1px solid var(--f5-brand-red);
      pointer-events: none;
      z-index: 9999;
    }

    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      margin: 0;
      padding: 0;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border);
      gap: 16px;
    }
    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .toolbar-center {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .toolbar .title {
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
      font-weight: 600;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toolbar .resource-type {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      white-space: nowrap;
    }
    .toolbar .resource-name {
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
      font-weight: 600;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toolbar .btn,
    .toolbar .btn-secondary,
    .toolbar .refresh-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      transition: background 0.2s;
    }
    .toolbar .btn:hover,
    .toolbar .btn-secondary:hover,
    .toolbar .refresh-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .toolbar-icon {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-badge-background, rgba(128, 128, 128, 0.15));
      border-radius: 6px;
      padding: 4px;
    }
    .toolbar-icon svg {
      width: 24px;
      height: 24px;
    }

    .toolbar-logo-wrap {
      width: 44px;
      height: 36px;
      overflow: hidden;
      flex-shrink: 0;
      position: relative;
      background: rgba(0, 0, 0, 0.45);
      border-radius: 6px;
      padding: 2px;
    }
    .toolbar-logo {
      font-family: 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1;
      white-space: pre;
      letter-spacing: -2.5px;
      margin: 0;
      transform: scale(0.15);
      transform-origin: top left;
      position: absolute;
      top: 2px;
      left: 2px;
      user-select: none;
      -webkit-font-smoothing: none;
      font-variant-ligatures: none;
    }
    .f5l { display: block; height: 1em; }
    .f5r { color: var(--f5-brand-red); }
    .f5w { color: #ffffff; font-weight: bold; }
    .f5s { color: var(--f5-brand-red-dark); }
  `;
}
