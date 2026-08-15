#!/usr/bin/env bash
# Run the Playwright suite against a stack this brings up itself.
#
#   bash scripts/e2e.sh                     the whole suite, local stack
#   bash scripts/e2e.sh --stack             the whole suite, compose topology
#   bash scripts/e2e.sh e2e/sync.spec.ts    one file (any playwright args pass
#   bash scripts/e2e.sh --headed -g share   through untouched)
#
# This is the pre-PR gate. `scripts/checks.sh` is the commit gate and is not a
# substitute for it: typecheck and the unit suite stay green while the app is
# broken in the browser, which is the whole reason this suite exists.
set -uo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$ROOT" || exit 1

mode=()
args=()
for arg in "$@"; do
  case "$arg" in
    --stack) mode=(--stack) ;;
    *) args+=("$arg") ;;
  esac
done

bash scripts/await_ready.sh || exit 1

base=$(bash scripts/start_app.sh "${mode[@]}" | tail -n 1) || exit 1
[[ -n "$base" ]] || { echo "could not determine the base URL" >&2; exit 1; }

# Playwright refuses to run against a browser build it did not install, and a
# sandboxed container often has one it cannot replace. Any usable chromium
# beats no run at all — see playwright.config.ts.
# The probe is a real launch: the pinned CHROME being present is not the same
# question as the run working, because a headless run reaches for the headless
# shell build beside it, and a container can have one without the other.
launches() {
  node -e "require('playwright').chromium.launch().then(b => b.close())" >/dev/null 2>&1
}

if [[ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-}" ]] && ! launches; then
  for candidate in "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium \
                   /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
    [[ -x "$candidate" ]] && { export PLAYWRIGHT_CHROMIUM_EXECUTABLE="$candidate"; break; }
  done
  [[ -n "${PLAYWRIGHT_CHROMIUM_EXECUTABLE:-}" ]] &&
    echo "[e2e] using $PLAYWRIGHT_CHROMIUM_EXECUTABLE (the pinned build is not installed)" >&2
fi

# The local stack has no MinIO behind /api/upload, so the image suite cannot
# pass there — and a red run nobody can fix reads exactly like a regression.
# Skip it EXPLICITLY and say so; CI (e2e-run.yml, on the compose stack) is what
# covers it. A caller who named their own files gets exactly those.
if [[ ${#mode[@]} -eq 0 && ${#args[@]} -eq 0 ]]; then
  mapfile -t args < <(ls e2e/*.spec.ts | grep -v '/image\.spec\.ts$')
  echo "[e2e] local stack: skipping e2e/image.spec.ts (upload needs the S3 stand-in from --stack; CI runs it)" >&2
fi

echo "[e2e] running against $base" >&2
PLAYWRIGHT_BASE_URL="$base" npx playwright test "${args[@]}"
