// webview/src/test-setup.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// The webview runs in VS Code's Chromium context where TextEncoder/TextDecoder
// are always present, but this project's jsdom test environment does not expose
// them. Polyfill from Node's util so the test env mirrors the real runtime.

import { TextDecoder, TextEncoder } from 'node:util';

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}
