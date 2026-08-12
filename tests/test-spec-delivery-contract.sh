#!/usr/bin/env bash
# Copyright (c) 2026 Robin Mordasiewicz. MIT License.

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
workflow="$repo_root/.github/workflows/ci.yml"
sync_script="$repo_root/scripts/sync-specs.ts"
check_script="$repo_root/scripts/check-specs.ts"
legacy_release_workflow="$repo_root/.github/workflows/release.yml"
failed=0

pass() { printf '[PASS] %s\n' "$1"; }
fail() {
  printf '[FAIL] %s\n' "$1" >&2
  failed=1
}

for field in delivery_id release_tag version target_commit trigger_source; do
  if grep -qF "github.event.client_payload.${field}" "$workflow"; then
    pass "workflow consumes dispatched ${field}"
  else
    fail "workflow omits dispatched ${field}"
  fi
done

if grep -qF 'npx ts-node scripts/spec-delivery.ts --github-output' "$workflow" &&
  grep -qF "if: needs.spec-delivery.outputs.process == 'true'" "$workflow" &&
  grep -qF "github.event.action == 'enriched-specs-updated'" "$workflow"; then
  pass 'delivery identity gates generation'
else
  fail 'generation is not gated by the delivery identity'
fi

if grep -qF 'Stage Spec Delivery' "$workflow" &&
  grep -qF 'tools/spec-delivery-pending.json' "$workflow" &&
  grep -qF 'needs.build.result == '\''success'\''' "$workflow"; then
  pass 'validated delivery is staged as pending'
else
  fail 'delivery is not staged after exact-tag validation'
fi

if grep -qF 'Record Published Spec Delivery' "$workflow" &&
  grep -qF 'tools/spec-deliveries.json' "$workflow" &&
  grep -qF 'tools/spec-publications.json' "$workflow" &&
  grep -qF 'Published VSIX no longer matches' "$workflow" &&
  grep -qF "needs.release.result == 'success'" "$workflow"; then
  pass 'delivery is recorded only after publication succeeds'
else
  fail 'applied delivery receipt is missing or precedes publication'
fi

publication_steps=$(sed -n '/Publish to Open VSX Registry/,/^  record-spec-delivery:/p' "$workflow")
if grep -qF 'bundle_sha256' "$workflow" "$sync_script" &&
  grep -qF 'target_commit' "$workflow" "$sync_script" &&
  grep -qF 'Verify published VSIX identity' "$workflow" &&
  ! grep -qF 'continue-on-error: true' <<<"$publication_steps"; then
  pass 'source and publication artifact identities gate the durable receipt'
else
  fail 'artifact hashes or required publication channels do not gate the receipt'
fi

if grep -qF '/releases/tags/' "$sync_script" &&
  grep -qF 'f5xc-api-specs-${release.releaseTag}.zip' "$sync_script" &&
  ! grep -qF '/releases/latest' "$sync_script" "$check_script"; then
  pass 'sync and check have no latest-release path'
else
  fail 'sync or check can still resolve a mutable latest release'
fi

if grep -qF 'resolveSpecDelivery' "$check_script" &&
  grep -qF "from './spec-delivery';" "$check_script" &&
  grep -qF 'const requested = resolveSpecDelivery();' "$sync_script"; then
  pass 'sync and check share the validated release contract'
else
  fail 'sync and check do not share the validated release contract'
fi

if grep -qF "process.platform === 'win32' ? 'npx.cmd' : 'npx'" "$check_script" &&
  grep -qF 'shell: false' "$check_script" &&
  ! grep -qF 'shell: true' "$check_script"; then
  pass 'spec sync spawns npx directly without a command shell'
else
  fail 'spec sync still invokes a command shell'
fi

if [ ! -e "$legacy_release_workflow" ] &&
  [ "$(grep -Rl 'HaaLeo/publish-vscode-extension' "$repo_root/.github/workflows" | wc -l | tr -d ' ')" -eq 1 ]; then
  pass 'only the receipt-gated CI workflow can publish marketplace artifacts'
else
  fail 'an alternate workflow can publish outside the receipt pipeline'
fi

if grep -qF 'Existing delivery branch changes unexpected paths' "$workflow" &&
  grep -qF 'Existing receipt branch changes unexpected paths' "$workflow" &&
  grep -qF 'Existing version bump branch changes unexpected paths' "$workflow" &&
  grep -qF 'Existing version bump branch contains different package content' "$workflow"; then
  pass 'resumed branches reject unrelated changes'
else
  fail 'resumed branches trust a branch name without checking its complete diff'
fi

if grep -qF 'deliveries | has($id) | not' "$workflow" &&
  grep -qF 'publications | has($id) | not' "$workflow"; then
  pass 'canonical delivery ledgers are append-only'
else
  fail 'canonical delivery ledgers can overwrite an existing receipt'
fi

if ! grep -qF 'DELIVERY_ID:0:' "$workflow"; then
  pass 'delivery and receipt branch names retain the full immutable delivery ID'
else
  fail 'delivery branch names truncate the immutable delivery ID'
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
