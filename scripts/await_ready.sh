#!/usr/bin/env bash
# Block until this checkout can actually be checked, then return.
#
#   bash scripts/await_ready.sh [--refresh]
#
# A container is cloned fresh for every web and mobile session: no
# node_modules, no server/node_modules, no Playwright browser. Until those
# exist, `npm test`, `npm run typecheck` and every Playwright run fail for
# reasons that have nothing to do with the change being made — a missing module
# reads exactly like a broken import.
#
# The SessionStart hook starts the preparation in the background so a session is
# not held up by it; this is how anything that needs the result waits for it.
# Safe and cheap to call before every check:
#   already prepared     -> returns in milliseconds
#   preparation running  -> blocks on the lock until it finishes
#   never prepared       -> runs it here (a few minutes on a cold container)
#
# --refresh re-runs the preparation even when the marker is already there.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT"

RUN_DIR="$ROOT/.dev"
READY_MARKER="$RUN_DIR/prepared"
LOCK="$RUN_DIR/prepare.lock"

refresh=false
[[ "${1:-}" == "--refresh" ]] && { refresh=true; shift; }
[[ $# -eq 0 ]] || { echo "usage: await_ready.sh [--refresh]" >&2; exit 2; }

mkdir -p "$RUN_DIR"
$refresh && rm -f "$READY_MARKER"

# The marker is read before the lock as well as inside it. There is nothing to
# wait for once preparation has finished, and taking the lock to learn that
# makes this script only as reliable as the lock — which is not something a
# caller about to run `npm test` should have to care about.
[[ -f "$READY_MARKER" ]] && exit 0

# The lock is what makes the hook's background run and a foreground caller the
# same run rather than two of them fighting over npm's cache.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock 9
fi

[[ -f "$READY_MARKER" ]] && exit 0
# 9>&- hands the child a copy of this shell without the lock descriptor: the
# preparation may leave background servers running, and one inheriting fd 9
# would hold the lock for the life of the container.
bash scripts/start_app.sh --prepare-only 9>&-
touch "$READY_MARKER"
