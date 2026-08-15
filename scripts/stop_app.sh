#!/usr/bin/env bash
# Stop whatever scripts/start_app.sh started — both modes, in any combination.
#
#   bash scripts/stop_app.sh            stop the local stack's processes
#   bash scripts/stop_app.sh --stack    also bring the compose stack down
#   bash scripts/stop_app.sh --all      both, plus the y-sweet document store
set -uo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT" || exit 1
RUN_DIR="$ROOT/.dev"

stack=false
wipe=false
for arg in "$@"; do
  case "$arg" in
    --stack) stack=true ;;
    --all) stack=true; wipe=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# setsid put each process in its own group, so the whole group goes at once —
# `npx vite` is a launcher whose child is the server, and killing only the pid
# leaves the port held.
for name in vite api ysweet; do
  pidfile="$RUN_DIR/$name.pid"
  [[ -f "$pidfile" ]] || continue
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    echo "stopped $name ($pid)"
  fi
  rm -f "$pidfile"
done

if $stack; then
  if $wipe; then
    docker compose -f docker-compose.yml -f docker-compose.local.yml down -v
  else
    docker compose -f docker-compose.yml -f docker-compose.local.yml down
  fi
fi

$wipe && rm -rf "$RUN_DIR/ysweet-store"
rm -f "$RUN_DIR/base_url"
