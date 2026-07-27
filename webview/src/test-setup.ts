// webview/src/test-setup.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// The webview runs in VS Code's Chromium context where TextEncoder/TextDecoder
// are always present, but this project's jsdom test environment does not expose
// them. Polyfill from Node's util so the test env mirrors the real runtime.

// Registers jest-dom's matchers AND brings their types into the program. The
// `declare global` augmentation in @testing-library/jest-dom only applies when a
// file in the TS program imports it, so listing the package as a bare
// `setupFilesAfterEnv` string registered the matchers at runtime while leaving
// `toBeInTheDocument` untyped — 10 TS2339s that nothing surfaced (#995). Import
// it here instead, so runtime registration and typing come from one place.
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}
