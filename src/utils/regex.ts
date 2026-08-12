// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/** Escape a string for literal use inside a JavaScript regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
