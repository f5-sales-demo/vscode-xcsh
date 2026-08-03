#!/usr/bin/env bash
# Copyright (c) 2026 Robin Mordasiewicz. MIT License.

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
config="$repo_root/.vscode-test.mjs"
workflow="$repo_root/.github/workflows/ci.yml"
failed=0

pass() { printf '[PASS] %s\n' "$1"; }
fail() {
  printf '[FAIL] %s\n' "$1" >&2
  failed=1
}

if grep -qF 'process.env.VSCODE_TEST_USER_DATA_DIR' "$config" &&
  grep -qF '`--user-data-dir=${userDataDir}`' "$config"; then
  pass 'VS Code test config accepts an explicit short user-data directory'
else
  fail 'VS Code test config cannot shorten its IPC socket path'
fi

linux_step=$(sed -n '/- name: Run integration tests (Linux)/,/^- name:/p' "$workflow")
if grep -qF 'mktemp -d /tmp/vscode-xcsh-test.XXXXXX' <<<"$linux_step" &&
  grep -qF 'VSCODE_TEST_USER_DATA_DIR="$test_user_data_dir"' <<<"$linux_step"; then
  pass 'Linux integration tests use a unique short-lived directory'
else
  fail 'Linux integration tests do not provide a unique short user-data directory'
fi

if grep -qF 'trap '\''rm -rf -- "$test_user_data_dir"'\'' EXIT' <<<"$linux_step"; then
  pass 'Linux integration-test directory is cleaned on every exit'
else
  fail 'Linux integration-test directory has no exit cleanup'
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
