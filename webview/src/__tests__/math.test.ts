// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { PANEL_CSS, renderMarkdown } from '../vendored/chat-ui';

function render(source: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(source);
  return root;
}

describe('assistant math rendering', () => {
  it('renders supported display LaTeX as semantic MathML', () => {
    const root = render('$$I \\propto \\frac{1}{\\lambda^4}$$');
    const math = root.querySelector('math[display="block"]');

    expect(math).not.toBeNull();
    expect(math?.querySelector('mfrac')).not.toBeNull();
    expect(math?.textContent).toContain('I');
    expect(math?.textContent).toContain('∝');
    expect(math?.textContent).toContain('λ');
    expect(root.textContent).not.toContain('\\frac');
  });

  it('keeps shell, currency, escaped dollars, and code literal', () => {
    const source = 'Pay $5; use $HOME or $' + '{PATH}; escape \\$x$; run `$x$`.';
    const root = render(source);

    expect(root.querySelector('math')).toBeNull();
    expect(root.textContent).toContain('$5');
    expect(root.textContent).toContain('$HOME');
    expect(root.textContent).toContain('$' + '{PATH}');
    expect(root.querySelector('code')?.textContent).toBe('$x$');
  });

  it('preserves incomplete, unsupported, and hostile LaTeX as source', () => {
    const samples = [
      '$$\\frac{1}{',
      '$$\\unsupported{x}$$',
      '$$\\includegraphics{https://example.invalid/x.png}$$',
      '$$\\class{evil}{x}$$',
    ];

    for (const source of samples) {
      const root = render(source);
      expect(root.textContent).toContain(source);
      expect(root.querySelector('math')).toBeNull();
      expect(root.querySelector('img, a, style, button')).toBeNull();
    }
  });

  it('bundles the scoped Temml fallback font without network URLs', () => {
    expect(PANEL_CSS).toContain('data:font/woff2;base64,');
    expect(PANEL_CSS).not.toMatch(/url\(["']?https?:/);
  });
});
