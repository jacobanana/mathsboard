#!/usr/bin/env bash
# SessionStart: get the checkout ready to be checked, without making the
# session wait for it.
#
# A container is cloned fresh for every web and mobile session, which leaves no
# node_modules, no server/node_modules and no browser. Until those exist,
# `npm test`, `npm run typecheck` and every Playwright run fail for reasons
# that have nothing to do with the change being made.
#
# The preparation takes minutes on a cold container and milliseconds on a warm
# one, so it runs detached and `scripts/await_ready.sh` is what blocks on it.
set -uo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

run_dir="$repo_root/.dev"
mkdir -p "$run_dir"

if [[ -f "$run_dir/prepared" ]]; then
  context="The dev environment is already prepared."
else
  # setsid detaches it from the session's process group, so the hook returns
  # now and the work survives.
  detach=()
  command -v setsid >/dev/null && detach=(setsid)
  "${detach[@]}" nohup bash scripts/await_ready.sh >"$run_dir/prepare.log" 2>&1 </dev/null &
  disown $! 2>/dev/null || true

  context="Preparing the dev environment in the background (npm install, the API server's own deps, the Playwright browser). Log: .dev/prepare.log"
fi

jq -n --arg context "$context" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ($context + "\n\nBefore running npm test, tsc, Playwright or the app, run `bash scripts/await_ready.sh` — it returns immediately when preparation is done and blocks until it is when it is not. Do not diagnose a failing test or a missing module before it has returned.")
  }
}'
