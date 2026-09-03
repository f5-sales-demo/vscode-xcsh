#!/usr/bin/env bash
# Decide whether a main push changes a shipped VSIX input. Unknown paths fail closed.
set -euo pipefail

paths_file=
head_commit_message=
github_output=false

usage() {
  echo "usage: $0 --paths-file FILE [--head-commit-message MESSAGE] [--github-output]" >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
  --paths-file)
    paths_file=${2:?missing paths file}
    shift 2
    ;;
  --head-commit-message)
    head_commit_message=${2-}
    shift 2
    ;;
  --github-output)
    github_output=true
    shift
    ;;
  *)
    usage
    exit 2
    ;;
  esac
done

[ -n "$paths_file" ] && [ -f "$paths_file" ] || {
  usage
  exit 2
}

emit() {
  printf 'eligible=%s\n' "$1"
  if [ "$github_output" = true ] && [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'eligible=%s\n' "$1" >>"$GITHUB_OUTPUT"
  fi
}

# A release-bump merge must never create another release, even if package.json is
# otherwise a release input.
if [[ "$head_commit_message" == *'chore(release)'* ]]; then
  emit false
  exit 0
fi

eligible=false
while IFS= read -r path || [ -n "$path" ]; do
  [ -n "$path" ] || continue
  case "$path" in
  # Runtime, webview, shipped assets and localization.
  # Package manifests and build configuration shipped with the extension.
  package.json | package-lock.json | webview/package.json | webview/package-lock.json | .nvmrc | webpack.config.* | tsconfig*.json | webview/tsconfig*.json | webview/vite.config.*)
    eligible=true
    ;;
  src/* | webview/* | resources/* | l10n/* | README.md | LICENSE)
    eligible=true
    ;;
  # Generation, versioning and immutable spec-delivery inputs.
  scripts/generate-doc-urls.ts | scripts/generate-resource-types.ts | scripts/generators/* | scripts/version.ts | scripts/spec-delivery.ts | scripts/sync-specs.ts | scripts/check-specs.ts | tools/spec-release.json | tools/spec-delivery-pending.json | tools/spec-deliveries.json | tools/spec-publications.json)
    eligible=true
    ;;
  # Intentionally non-release surfaces: automation, docs, tests, governance,
  # assistant assets, and developer-only lint/tooling configuration.
  .github/* | .claude/* | .agents/* | docs/* | tests/* | test/* | coverage/* | *.md | .gitignore | .editorconfig | .prettier* | .eslint* | eslint.config.* | jest.config.* | biome.json | .yamllint.yaml | .markdownlint.json | .shellcheckrc | .codespellrc | .gitleaks.toml | .pre-commit-config.yaml | .husky/* | scripts/agy-* | scripts/audit-* | scripts/check-* | scripts/github-api-resilience.cjs | scripts/lint-* | scripts/locale-lint.sh | scripts/pre-commit-local.sh | scripts/release-change-policy.sh | scripts/run-with-progress.sh | scripts/update-resource-coverage.ts | scripts/validate-* | scripts/verify-*)
    ;;
  *)
    echo "::error::Unclassified release-change path: $path" >&2
    exit 1
    ;;
  esac
done <"$paths_file"

emit "$eligible"
