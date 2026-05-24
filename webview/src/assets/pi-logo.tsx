// webview/src/assets/pi-logo.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
// ASCII art sourced from xcsh welcome screen

const F5_LOGO_LINES = [
  '                   ________',
  '              (▒▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒)',
  '         (▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒)',
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

function colorChar(char: string): { text: string; className: string } {
  if (char === '▓') {
    return { text: '█', className: 'asciiRed' };
  }
  if (char === '█') {
    return { text: '█', className: 'asciiWhite' };
  }
  if (char === '▒') {
    return { text: '▒', className: 'asciiShadow' };
  }
  if ('()|_'.includes(char)) {
    return { text: char, className: 'asciiRed' };
  }
  return { text: char, className: '' };
}

export function F5AsciiLogo() {
  return (
    <pre className="asciiLogo" role="img" aria-label="F5 logo">
      {F5_LOGO_LINES.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static array
        <div key={i} className="asciiLine">
          {[...line].map((char, j) => {
            const { text, className } = colorChar(char);
            return className ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: static character array
              <span key={j} className={className}>
                {text}
              </span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: static character array
              <span key={j}>{text}</span>
            );
          })}
        </div>
      ))}
    </pre>
  );
}
