// webview/src/lib/i18n.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

type StringMap = Record<string, string>;

let bundle: StringMap = {};

export function setL10nBundle(strings: StringMap): void {
  bundle = strings;
}

export function t(key: string, ...args: Array<string | number>): string {
  let template = bundle[key] ?? key;
  for (let i = 0; i < args.length; i++) {
    template = template.replace(`{${i}}`, String(args[i]));
  }
  return template;
}
