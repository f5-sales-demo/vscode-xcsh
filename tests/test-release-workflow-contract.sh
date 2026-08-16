#!/usr/bin/env bash
# Verify that manual release recovery remains a narrow, immutable-main operation.
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
workflow="$repo_root/.github/workflows/ci.yml"
failed=0

pass() { printf '[PASS] %s\n' "$1"; }
fail() {
  printf '[FAIL] %s\n' "$1" >&2
  failed=1
}

eligibility=$(sed -n '/^  release-eligibility:/,/^  # Create release/p' "$workflow")
release=$(sed -n '/^  release:/,/^  stage-spec-delivery:/p' "$workflow")
publication=$(sed -n '/- name: Verify published VSIX identity/,/- name: Publish to Open VSX Registry/p' "$workflow")

if grep -qF 'release_recovery:' "$workflow" &&
  grep -qF 'type: boolean' "$workflow" &&
  grep -qF 'expected_main_sha:' "$workflow" &&
  grep -qF 'type: string' "$workflow"; then
  pass 'workflow declares typed recovery inputs'
else
  fail 'workflow does not declare typed recovery inputs'
fi

if grep -qF 'GITHUB_EVENT_NAME" != workflow_dispatch' <<<"$eligibility" &&
  grep -qF 'RELEASE_RECOVERY" != true' <<<"$eligibility" &&
  grep -qF "echo 'eligible=false'" <<<"$eligibility"; then
  pass 'ordinary manual dispatches are release-ineligible'
else
  fail 'ordinary manual dispatch can become release-eligible'
fi

if grep -qF '^[0-9a-f]{40}$' <<<"$eligibility" &&
  grep -qF 'CHECKED_OUT_SHA=$(git rev-parse HEAD)' <<<"$eligibility" &&
  grep -qF 'git fetch --no-tags origin main' <<<"$eligibility" &&
  grep -qF 'CURRENT_MAIN_SHA=$(git rev-parse origin/main)' <<<"$eligibility" &&
  grep -qF 'EXPECTED_MAIN_SHA" != "$CHECKED_OUT_SHA"' <<<"$eligibility" &&
  grep -qF 'EXPECTED_MAIN_SHA" != "$CURRENT_MAIN_SHA"' <<<"$eligibility"; then
  pass 'recovery binds a lowercase full SHA to checkout and current main'
else
  fail 'recovery is not bound to the exact current main head'
fi

if grep -qF 'environment: release' <<<"$release" &&
  grep -qF "github.event_name == 'push'" <<<"$release" &&
  grep -qF "github.event_name == 'workflow_dispatch'" <<<"$release" &&
  grep -qF 'inputs.release_recovery == true' <<<"$release"; then
  pass 'only a qualifying push or protected recovery dispatch can create a release'
else
  fail 'release job gate does not preserve the protected recovery contract'
fi

if grep -qF "jq -r '.immutable'" <<<"$publication" &&
  grep -qF 'GitHub Release is not immutable' <<<"$publication" &&
  grep -qF '.assets | length == 1 and .[0].name == $name' <<<"$publication" &&
  grep -qF 'Published VSIX digest does not match the locally built artifact' <<<"$publication"; then
  pass 'immutable release and exact sole VSIX are verified before marketplace publication'
else
  fail 'publication can run without immutable exact-release verification'
fi
[ "$failed" -eq 0 ]
