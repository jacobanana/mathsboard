#!/usr/bin/env bash
# The commit gate: everything that is fast enough to run between a change and a
# commit. Mirrors .github/workflows/unit-run.yml, which is the job that gates
# every heavier pipeline in CI.
#
#   scripts/checks.sh                 typecheck + unit tests
#   scripts/checks.sh typecheck       just one leg
#
# Called by .claude/hooks/commit-checks.sh (Claude Code's Bash tool) and safe to
# run by hand. Prints a report of what failed and exits 1, or exits 0 SILENTLY.
# Silence is the pass.
#
# It deliberately does NOT run the Playwright suite: that boots a whole stack
# and takes minutes, which has no business sitting between a change and a
# commit. `scripts/e2e.sh` is the pre-PR gate — see CLAUDE.md.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 2

failures=""

report() {
  failures+="### $1 failed"$'\n'"$(tail -n 40 <<<"$2")"$'\n\n'
}

run() {
  local label=$1; shift
  local out
  out=$("$@" 2>&1) || report "$label" "$out"
}

if [[ ! -d node_modules ]]; then
  echo "### checks could not run"
  echo "node_modules is missing — run 'bash scripts/await_ready.sh' (or 'npm install')."
  exit 1
fi

typecheck_checks() { run "npm run typecheck" npm run typecheck; }
unit_checks()      { run "npm test" npm test; }

# No scope means the whole gate, not nothing. This script reports failure by
# printing and success by staying silent, so an argument-less run that skipped
# every check would be indistinguishable at the call site from one that passed
# them all — and running it bare is what CLAUDE.md tells a reader to do.
scopes=("$@")
[[ ${#scopes[@]} -eq 0 ]] && scopes=(typecheck unit)

for scope in "${scopes[@]}"; do
  case "$scope" in
    typecheck) typecheck_checks ;;
    unit)      unit_checks ;;
    *) echo "unknown scope: $scope (expected 'typecheck' or 'unit')" >&2; exit 2 ;;
  esac
done

if [[ -n "$failures" ]]; then
  printf '%s' "$failures"
  exit 1
fi
