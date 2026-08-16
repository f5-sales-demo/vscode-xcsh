#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
policy="$root/scripts/release-change-policy.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
passed=0 failed=0
pass() {
  echo "[PASS] $1"
  passed=$((passed + 1))
}
fail() {
  echo "[FAIL] $1: $2" >&2
  failed=$((failed + 1))
}

case_result() {
  local name=$1 expected=$2 paths=$3 message=${4:-}
  printf '%s\n' "$paths" >"$work/paths"
  set +e
  output=$(bash "$policy" --paths-file "$work/paths" --head-commit-message "$message" 2>&1)
  rc=$?
  set -e
  if [ "$expected" = error ] && [ "$rc" -ne 0 ]; then
    pass "$name"
    return
  fi
  if [ "$rc" -eq 0 ] && grep -qxF "eligible=$expected" <<<"$output"; then pass "$name"; else fail "$name" "exit=$rc $output"; fi
}

case_result 'runtime input is eligible' true 'src/extension.ts'
case_result 'shipped content is eligible' true $'resources/logo.svg\nREADME.md'
case_result 'managed sync is ineligible' false $'.github/workflows/translation-audit.yml\nAGENTS.md'
case_result 'CI, test, documentation and governance are ineligible' false $'.github/workflows/ci.yml\ntests/test-example.sh\ndocs/guide.md\n.claude/governance.json'
case_result 'deleted legacy resource coverage tooling is ineligible' false 'scripts/update-resource-coverage.ts'
case_result 'unknown paths fail closed' error 'new-product-surface/file.ts'
case_result 'release bump commit cannot recurse' false 'package.json' 'chore(release): v2.1.207-260814230728'

echo "Results: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
