// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type Temml from 'temml';

const runtime = (globalThis as typeof globalThis & { temml?: typeof Temml }).temml;
if (!runtime) {
  throw new Error('Temml browser runtime was not loaded');
}

export default runtime;
export type { Options } from 'temml';
