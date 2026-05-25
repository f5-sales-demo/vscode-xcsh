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
      --f5-toolbar-gradient: linear-gradient(90deg, var(--f5-brand-red-dark) 0%, var(--f5-brand-red) 100%);
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
