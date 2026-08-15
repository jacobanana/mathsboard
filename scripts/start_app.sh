#!/usr/bin/env bash
# Bring the board up so it can be driven — by Playwright, by the screenshot
# skill, or by a human with a browser.
#
#   bash scripts/start_app.sh                 local stack (no Docker), :5173
#   bash scripts/start_app.sh --stack         the compose topology,      :8080
#   bash scripts/start_app.sh --prepare-only  install deps and stop there
#
# Idempotent: a stack already answering on the port it wants is reused, so this
# is safe to run before every screenshot session and at the top of every e2e
# run. It prints the base URL on stdout and writes it to .dev/base_url.
#
# --- why two modes ------------------------------------------------------------
#
# The documented way to run everything is docker-compose.local.yml: Caddy + the
# token API + Y-Sweet + MinIO, production build on :8080. That is the topology
# CI tests and the one to reproduce a deployment bug in.
#
# It needs a Docker daemon, and a cloud dev container has none — which would
# leave a web or mobile session unable to run any e2e test or take any
# screenshot at all. So the DEFAULT mode runs the same three moving parts as
# plain processes: `y-sweet serve` (the npm distribution of the same server the
# ysweet image runs), `server/index.js` (the token API, unchanged), and the
# Vite dev server proxying /api and /ys at them (see vite.config.ts).
#
# What the local mode gives you: the whole app, real sharing between real
# clients, presence, join codes, sync — and hot reload, which the compose stack
# does not have (its web image bakes the frontend in and has to be rebuilt).
#
# The one thing it does NOT give you is image upload: POST /api/upload streams
# into S3, MinIO is the thing standing in for S3, and MinIO is a container.
# Uploads answer 502 in local mode; e2e.sh knows this and says so.
set -uo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT" || exit 1

RUN_DIR="$ROOT/.dev"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.local.yml)

# The npm distribution of the same sync server the compose stack pulls as an
# image. Pinned to the @y-sweet/client major the frontend depends on.
YSWEET_PKG="y-sweet@0.9.1"

APP_PORT=${MB_PORT:-5173}
API_PORT=${MB_API_PORT:-8787}
YS_PORT=${MB_YS_PORT:-8091}
STACK_URL="http://127.0.0.1:8080"
LOCAL_URL="http://127.0.0.1:${APP_PORT}"

mode=local
prepare_only=false
fresh=false
for arg in "$@"; do
  case "$arg" in
    --stack) mode=stack ;;
    --local) mode=local ;;
    --prepare-only) prepare_only=true ;;
    --fresh) fresh=true ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$RUN_DIR"
log() { echo "[start_app] $*" >&2; }

# ---- 1. dependencies ---------------------------------------------------------
# Everything below needs these, and a container is cloned fresh for every web
# and mobile session: no node_modules, no server/node_modules, no browser.

install_deps() {
  if [[ ! -d node_modules || package-lock.json -nt node_modules ]]; then
    log "npm install"
    npm install --no-audit --no-fund >>"$RUN_DIR/setup.log" 2>&1 || {
      log "npm install FAILED — see .dev/setup.log"; return 1; }
  fi
  # The token API is its own package; the local stack runs it from source.
  if [[ ! -d server/node_modules || server/package-lock.json -nt server/node_modules ]]; then
    log "npm install (server)"
    (cd server && npm install --no-audit --no-fund) >>"$RUN_DIR/setup.log" 2>&1 || {
      log "npm install (server) FAILED — see .dev/setup.log"; return 1; }
  fi
  # The two downloads, behind a marker: both are no-ops once they have run, but
  # both go to the network to find that out, and this script is meant to be
  # cheap enough to put in front of every screenshot and every e2e run.
  [[ -f "$RUN_DIR/tools-fetched" ]] && return 0

  # A no-op when the image already ships the pinned browser, a download when it
  # does not — and a sandboxed container may be able to do neither. Not fatal:
  # scripts/e2e.sh and the screenshot script fall back to any chromium on the
  # box, and the unit gate needs no browser at all.
  npx playwright install chromium >>"$RUN_DIR/setup.log" 2>&1 ||
    log "could not install the pinned Playwright browser — falling back to any chromium on the box"
  # Warm the npx cache for the sync server, so the first `Share` does not wait
  # on a download. Same reason, same non-fatal treatment.
  npx --yes "$YSWEET_PKG" version >>"$RUN_DIR/setup.log" 2>&1 ||
    log "could not fetch $YSWEET_PKG — local-mode sharing will not start"

  touch "$RUN_DIR/tools-fetched"
}

install_deps || exit 1
$prepare_only && { log "prepared (deps only)"; exit 0; }

# ---- 2. is something already up? --------------------------------------------

healthy() { curl -fsS --noproxy '*' --max-time 3 "$1/api/health" >/dev/null 2>&1; }

target_url=$LOCAL_URL
[[ $mode == stack ]] && target_url=$STACK_URL

if ! $fresh && healthy "$target_url"; then
  log "reusing the stack already answering on $target_url"
  echo "$target_url" | tee "$RUN_DIR/base_url"
  exit 0
fi

# ---- 3a. the compose topology -----------------------------------------------

start_stack() {
  docker info >/dev/null 2>&1 || {
    log "no Docker daemon — run without --stack for the local stack"; return 1; }
  $fresh && "${COMPOSE[@]}" down -v >>"$RUN_DIR/setup.log" 2>&1
  log "docker compose up --build (first run takes a few minutes)"
  "${COMPOSE[@]}" up --build -d >>"$RUN_DIR/setup.log" 2>&1 || {
    log "compose up FAILED — see .dev/setup.log"; return 1; }
  wait_for "$STACK_URL" 120 || { "${COMPOSE[@]}" logs --no-color --tail 50 >&2; return 1; }
}

# ---- 3b. the local stack (no Docker) ----------------------------------------

# One dev keypair, generated on first use and kept, so a board created in one
# session still opens in the next.
ysweet_auth() {
  local file="$RUN_DIR/ysweet-auth.json"
  [[ -s "$file" ]] || npx --yes "$YSWEET_PKG" gen-auth --json >"$file" 2>/dev/null
  [[ -s "$file" ]] || { log "could not generate a y-sweet keypair"; return 1; }
  node -e "const a=require('$file');console.log(a.private_key,a.server_token)"
}

# Start $1 (a label) in the background, note its pid, point its output at a log.
spawn() {
  local name=$1; shift
  setsid nohup "$@" >"$RUN_DIR/$name.log" 2>&1 </dev/null &
  echo $! >"$RUN_DIR/$name.pid"
  disown $! 2>/dev/null || true
}

start_local() {
  local keys private_key server_token
  keys=$(ysweet_auth) || return 1
  read -r private_key server_token <<<"$keys"

  $fresh && rm -rf "$RUN_DIR/ysweet-store"
  mkdir -p "$RUN_DIR/ysweet-store"

  log "y-sweet on :$YS_PORT"
  Y_SWEET_AUTH="$private_key" spawn ysweet \
    npx --yes "$YSWEET_PKG" serve --port "$YS_PORT" --host 127.0.0.1 "$RUN_DIR/ysweet-store"

  log "token api on :$API_PORT"
  # S3_BUCKET is required at boot but only read by the upload routes, which
  # have no storage behind them here — see the header.
  YSWEET_CONNECTION_STRING="ys://$server_token@127.0.0.1:$YS_PORT" \
  S3_BUCKET=mathsboard PORT="$API_PORT" \
  AWS_ACCESS_KEY_ID=dev AWS_SECRET_ACCESS_KEY=dev AWS_REGION=us-east-1 \
    spawn api node server/index.js

  log "vite on :$APP_PORT"
  MB_API_TARGET="http://127.0.0.1:$API_PORT" \
  MB_YS_TARGET="http://127.0.0.1:$YS_PORT" \
    spawn vite npx vite --host 127.0.0.1 --port "$APP_PORT" --strictPort

  wait_for "$LOCAL_URL" 60 || {
    for l in ysweet api vite; do echo "--- $l ---" >&2; tail -n 20 "$RUN_DIR/$l.log" >&2; done
    return 1
  }
}

# /api/health is served by the token API and reached through whatever fronts it
# — Caddy in stack mode, the Vite proxy in local mode. One check covers both,
# and a green answer means the whole chain is wired, not just that a port is open.
wait_for() {
  local url=$1 tries=$2
  for _ in $(seq 1 "$tries"); do
    healthy "$url" && return 0
    sleep 2
  done
  log "$url did not come up"
  return 1
}

if [[ $mode == stack ]]; then
  start_stack || exit 1
  base=$STACK_URL
else
  start_local || exit 1
  base=$LOCAL_URL
fi

echo "$base" >"$RUN_DIR/base_url"
log "up on $base (logs in .dev/, stop with 'bash scripts/stop_app.sh')"
echo "$base"
