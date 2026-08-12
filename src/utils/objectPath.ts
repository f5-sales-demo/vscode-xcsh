// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

const UNSAFE_PATH_COMPONENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** Set a nested value using a validated dot-separated object path. */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  if (parts.some((part) => part.length === 0 || UNSAFE_PATH_COMPONENTS.has(part))) {
    throw new Error('Unsafe object path');
  }

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    const existing = Object.hasOwn(current, part) ? current[part] : undefined;
    if (typeof existing === 'object' && existing !== null) {
      current = existing as Record<string, unknown>;
      continue;
    }

    const child: Record<string, unknown> = {};
    Object.defineProperty(current, part, {
      configurable: true,
      enumerable: true,
      value: child,
      writable: true,
    });
    current = child;
  }

  const lastPart = parts[parts.length - 1] as string;
  Object.defineProperty(current, lastPart, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
