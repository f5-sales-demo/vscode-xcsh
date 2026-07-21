// lint-staged configuration.
//
// Externalised from package.json to a function config so the vendored shared
// library (webview/src/vendored/**) can be excluded from every task: those files
// are a byte-exact copy of @f5-sales-demo/xcsh-chat-ui (drift-guarded by
// vendorSync.test.ts and eslint/biome-ignored), so they must not be linted or
// reformatted to this repo's style here — and passing eslint-ignored files with
// --max-warnings=0 would fail on the "ignored file" warning.

const notVendored = (files) => files.filter((f) => !f.includes('/vendored/'));
const join = (files) => files.map((f) => JSON.stringify(f)).join(' ');

export default {
  '*.{ts,tsx}': (files) => {
    const f = notVendored(files);
    if (f.length === 0) return [];
    const list = join(f);
    return [`eslint --fix --max-warnings=0 ${list}`, `biome check --fix ${list}`, `biome format --write ${list}`];
  },
  '*.{json,yaml,yml}': (files) => {
    const f = notVendored(files);
    return f.length === 0 ? [] : [`prettier --write ${join(f)}`];
  },
  '*.md': (files) => {
    const f = notVendored(files);
    return f.length === 0 ? [] : [`prettier --write ${join(f)}`, `markdownlint --fix ${join(f)}`];
  },
};
