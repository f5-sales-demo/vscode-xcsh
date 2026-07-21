// webview/test/uat/composer-render.mjs
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Headless render + behaviour UAT for the shared xcsh-chat-ui Composer as it
// runs inside the built VS Code webview. Serves the REAL Vite bundle
// (dist/webview) over a throwaway localhost server and loads it in
// Chrome-for-Testing with an injected `acquireVsCodeApi` stub — no live VS Code
// — so it is deterministic and exercises what jsdom unit tests cannot: that the
// actual built bundle mounts, paints the shared terminal composer, and that the
// composer's controls drive the real webview→extension protocol (prompt / slash
// / attach / tools / mode) and render an assistant reply pushed back over the
// message bridge. (A localhost server, not file://, because the Vite bundle uses
// absolute /assets/ paths.)
//
// Run: npm run build:webview && npm run uat:webview
// Exits non-zero on any assertion mismatch. Screenshot → webview/test/uat/.artifacts/.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', '..', '..', 'dist', 'webview');
const ARTIFACTS = join(HERE, '.artifacts');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const sys = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(sys)) return sys;
  const base = join(process.env.HOME ?? '', '.cache', 'puppeteer', 'chrome');
  if (!existsSync(base)) throw new Error('no Chrome; set CHROME_BIN or install Chrome-for-Testing');
  const verParts = (d) => (d.split('-')[1] ?? '').split('.').map(Number);
  const byVersion = (a, b) => {
    const x = verParts(a);
    const y = verParts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  };
  const dirs = readdirSync(base)
    .filter((d) => /^(mac|linux|win)/.test(d))
    .sort(byVersion);
  const latest = dirs.at(-1);
  const mac = join(
    base,
    latest,
    'chrome-mac-arm64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  );
  if (existsSync(mac)) return mac;
  const linux = join(base, latest, 'chrome-linux64', 'chrome');
  if (existsSync(linux)) return linux;
  throw new Error(`Chrome binary not found under ${join(base, latest)}`);
}

// Serve dist/webview statically. Paths are confined to DIST (normalized + prefix
// check) — this only ever serves our own build output.
function serve() {
  const root = realpathSync(DIST);
  const under = (f) => f === root || f.startsWith(root + sep);
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(root, p));
    // Confine to DIST: reject lexical escape (normalize + separator-boundary
    // prefix), then resolve symlinks and re-check the real path.
    if (!under(file) || !existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    let resolved;
    try {
      resolved = realpathSync(file);
    } catch {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (!under(resolved)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(resolved)] ?? 'application/octet-stream' });
    res.end(readFileSync(resolved));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })),
  );
}

// Injected before the bundle runs: stub the VS Code webview API and expose a
// capture buffer for outbound (webview→extension) messages.
function stub() {
  globalThis.__posted = [];
  globalThis.acquireVsCodeApi = () => ({
    postMessage: (m) => globalThis.__posted.push(m),
    getState: () => ({}),
    setState: () => {},
  });
}

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/webview/index.html missing — run `npm run build:webview` first');
    process.exit(2);
  }
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 760 });
    page.on('pageerror', (e) => ok('no page error', false, String(e)));
    await page.evaluateOnNewDocument(`(${stub})()`);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle0' });
    // A few VS Code theme vars the components would inherit from the host (cosmetic).
    await page.addStyleTag({
      content: ':root{--vscode-foreground:#ccc;--vscode-editor-background:#1e1e1e;--vscode-font-family:sans-serif;}',
    });

    // 1. The built bundle mounts and paints the shared terminal composer.
    await page.waitForSelector('[role="textbox"][aria-label="Message input"]', { timeout: 5000 });
    ok('composer editor renders from the built bundle', true);
    ok(
      'shared PANEL_CSS is injected (.composer styled)',
      await page.evaluate(() =>
        [...document.querySelectorAll('style')].some((s) => s.textContent.includes('.composer')),
      ),
    );
    ok(
      'F5 terminal token is present (--f5-red)',
      await page.evaluate(
        () => getComputedStyle(document.documentElement).getPropertyValue('--f5-red').trim().length > 0,
      ),
    );
    const btn = (name) => page.$(`button[aria-label="${name}"]`);
    ok('send button present', !!(await btn('Send')));
    ok('attach (+) button present', !!(await btn('Add context')));
    ok('slash (/) button present', !!(await btn('Slash commands')));
    await page.screenshot({ path: join(ARTIFACTS, '1-composer.png') });

    // 2. Attach menu opens with the VS Code categories.
    await (await btn('Add context')).click();
    await page.waitForSelector('[role="menu"]', { timeout: 2000 });
    const cats = await page.$$eval('[role="menuitem"]', (els) => els.map((e) => e.textContent));
    ok(
      'attach menu lists Files + Tools categories',
      cats.some((c) => /Files/.test(c)) && cats.some((c) => /Tools/.test(c)),
      cats.join(' | '),
    );
    await page.keyboard.press('Escape');

    // 3. Slash menu opens; picking /status posts a prompt over the protocol.
    await (await btn('Slash commands')).click();
    await page.waitForSelector('[role="menu"]', { timeout: 2000 });
    const statusItem = await page.evaluateHandle(() =>
      [...document.querySelectorAll('[role="menuitem"]')].find((e) => /\/status/.test(e.textContent)),
    );
    await statusItem.asElement().click();
    await page.waitForFunction(() => globalThis.__posted.some((m) => m.type === 'prompt' && m.text === '/status'), {
      timeout: 2000,
    });
    ok('slash /status posts a prompt message', true);
    // Sending sets the session busy (Send→Stop); end the turn so the composer
    // is idle again for the next send.
    await page.evaluate(() => window.postMessage({ type: 'from-extension', message: { type: 'turn_end' } }, '*'));
    await page.waitForSelector('button[aria-label="Send"]', { timeout: 2000 });

    // 4. Typing + Send posts the typed prompt over the protocol.
    await page.evaluate(() => {
      const el = document.querySelector('[role="textbox"][aria-label="Message input"]');
      el.textContent = 'create a load balancer';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await (await btn('Send')).click();
    await page.waitForFunction(
      () => globalThis.__posted.some((m) => m.type === 'prompt' && m.text === 'create a load balancer'),
      { timeout: 2000 },
    );
    ok('typing + Send posts the typed prompt', true);

    // 5. An extension→webview reply renders in the transcript.
    await page.evaluate(() =>
      window.postMessage(
        { type: 'from-extension', message: { type: 'message_update', text: 'Creating the load balancer now.' } },
        '*',
      ),
    );
    await page.waitForFunction(() => document.body.textContent.includes('Creating the load balancer now.'), {
      timeout: 3000,
    });
    ok('assistant reply from the message bridge renders', true);
    await page.screenshot({ path: join(ARTIFACTS, '2-conversation.png') });
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
