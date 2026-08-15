#!/usr/bin/env bash
# Close only demonstrably automated, package.json-only stale version-bump PRs.
set -euo pipefail

current_branch=${1:?usage: $0 CURRENT_BRANCH RELEASE_SOURCE_SHA}
release_source_sha=${2:?usage: $0 CURRENT_BRANCH RELEASE_SOURCE_SHA}
comment='Superseded by the release-policy fix/current release. The branch is retained for auditability.'

prs=$(gh pr list --state open --base main --limit 100 \
  --json number,headRefName,title)

declare -a stale_prs=()
while IFS= read -r encoded; do
  pr=$(printf '%s' "$encoded" | base64 --decode)
  number=$(jq -er '.number' <<<"$pr")
  branch=$(jq -er '.headRefName' <<<"$pr")
  title=$(jq -er '.title' <<<"$pr")

  [[ "$branch" == chore/release-v* ]] || continue
  version=${branch#chore/release-v}
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9]{12}$ ]] ||
    [ "$title" != "chore(release): v${version}" ]; then
    echo "::error::Refusing to touch noncanonical version-bump PR #$number" >&2
    exit 1
  fi
  if ! git ls-remote --exit-code --heads origin "refs/heads/$branch" >/dev/null 2>&1; then
    echo "::error::Canonical-looking version-bump PR #$number has no remote branch" >&2
    exit 1
  fi
  git fetch --quiet origin "refs/heads/$branch:refs/remotes/origin/$branch"
  branch_base=$(git merge-base "$release_source_sha" "origin/$branch")
  paths=$(git diff --name-only "$branch_base" "origin/$branch" | LC_ALL=C sort)
  if [ "$paths" != package.json ] ||
    [ "$(git log -1 --format=%s "origin/$branch")" != "chore(release): v${version}" ] ||
    [ "$(git log -1 --format='%an <%ae>' "origin/$branch")" != 'github-actions[bot] <github-actions[bot]@users.noreply.github.com>' ]; then
    echo "::error::Refusing to touch noncanonical version-bump PR #$number" >&2
    exit 1
  fi
  jq -er '.version | strings | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' \
    <(git show "origin/$branch:package.json") >/dev/null || {
    echo "::error::Refusing to touch noncanonical version-bump PR #$number" >&2
    exit 1
  }
  [ "$branch" = "$current_branch" ] || stale_prs+=("$number")
done < <(jq -r '.[] | @base64' <<<"$prs")

# Validate every candidate first, then mutate. A malformed later PR cannot leave
# earlier PRs half-cleaned.
for number in "${stale_prs[@]}"; do
  gh pr comment "$number" --body "$comment"
  while IFS= read -r issue; do
    [ -n "$issue" ] || continue
    gh issue comment "$issue" --body "$comment"
    gh issue close "$issue"
  done < <(gh pr view "$number" --json closingIssuesReferences --jq '.closingIssuesReferences[].number')
  gh pr close "$number"
done
