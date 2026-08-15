#!/usr/bin/env bash
# PreToolUse/Bash gate: refuse `git commit` until typecheck and the unit suite pass.
#
# Reads the hook payload on stdin, and only acts when the command is a real
# commit. The checks themselves live in scripts/checks.sh, which mirrors the
# unit job every CI pipeline is gated on. Escape hatch: CLAUDE_SKIP_COMMIT_CHECKS=1.
#
# It deliberately stops at the fast checks. The Playwright suite is the pre-PR
# gate (scripts/e2e.sh), not the pre-commit one — see CLAUDE.md.
set -uo pipefail

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')

# Matches `git commit`, `git -C dir commit`, and commits chained after cd/&&/;.
if ! grep -Eq '(^|[;&|(]|&&)[[:space:]]*git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]-][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)' <<<"$command"; then
  exit 0
fi

grep -Eq -- '--dry-run' <<<"$command" && exit 0
[[ "${CLAUDE_SKIP_COMMIT_CHECKS:-}" == "1" ]] && exit 0

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

# Staged plus unstaged, so `git commit -a` is covered too.
changed=$(git diff --cached --name-only --diff-filter=ACMR; git diff --name-only --diff-filter=ACMR)

# Nothing the build reads changed (a doc, a workflow, a compose file): the gate
# has nothing to say about it.
grep -Eq '\.(ts|tsx|json|css|html)$' <<<"$changed" || exit 0

report=$(scripts/checks.sh) && exit 0

jq -n --arg reason "Commit blocked: checks did not pass. Fix these, then commit again.

$report" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'
