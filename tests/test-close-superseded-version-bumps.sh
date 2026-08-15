#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
script="$root/scripts/close-superseded-version-bumps.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin"
log="$work/log"

cat >"$work/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf 'gh %s\n' "$*" >> "$MOCK_LOG"
case "$1 $2" in
  'pr list') printf '%s\n' "$MOCK_PRS" ;;
  'pr view') printf '%s\n' "$MOCK_ISSUES" ;;
esac
EOF
cat >"$work/bin/git" <<'EOF'
#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "$MOCK_LOG"
case "$1" in
  ls-remote|fetch) exit 0 ;;
  merge-base) echo base ;;
  diff) echo package.json ;;
  log)
    if [[ "$*" == *'%an <%ae>'* ]]; then
      echo 'github-actions[bot] <github-actions[bot]@users.noreply.github.com>'
    else
      echo "chore(release): v2.1.207-260814000000"
    fi ;;
  show) printf '{"version":"2.1.207"}\n' ;;
esac
EOF
chmod +x "$work/bin/gh" "$work/bin/git"

run() { PATH="$work/bin:$PATH" MOCK_LOG="$log" MOCK_PRS="$1" MOCK_ISSUES='1363' bash "$script" chore/release-v2.1.207-260814999999 source; }
canonical='[{"number":12,"headRefName":"chore/release-v2.1.207-260814000000","title":"chore(release): v2.1.207-260814000000","author":{"login":"github-actions[bot]"}}]'
run "$canonical"
grep -qF 'gh issue close 1363' "$log" && grep -qF 'gh pr close 12' "$log"

rm -f "$log"
unsafe='[{"number":13,"headRefName":"chore/release-v2.1.207-260814000000","title":"manual release","author":{"login":"github-actions[bot]"}}]'
if run "$unsafe"; then
  echo '[FAIL] unsafe candidate was accepted' >&2
  exit 1
fi
if [ -s "$log" ] && grep -qE 'gh (issue close|pr close)' "$log"; then
  echo '[FAIL] unsafe candidate was mutated' >&2
  exit 1
fi
echo '[PASS] canonical stale PR and linked issue are closed; unsafe PR is rejected'
