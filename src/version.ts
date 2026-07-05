// App version, baked in at build time from git (see .github/actions/app-version).
// Unset in local dev, so it falls back to "dev".
//
// logVersions() prints the frontend build to the browser console on startup and,
// when collaboration is enabled, fetches the backend's version too - so a bug
// report's console screenshot pins the exact build of both halves. The static
// Pages build has no backend, so it logs the frontend only.
import { COLLAB_ENABLED } from "@/config";

export const FRONTEND_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

export function logVersions(): void {
  console.log(`mathsboard frontend ${FRONTEND_VERSION}`);
  if (!COLLAB_ENABLED) return; // static single-user build: no backend to ask.
  fetch("/api/version")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d) => console.log(`mathsboard backend ${d?.version ?? "unknown"}`))
    .catch(() => console.log("mathsboard backend unreachable"));
}
