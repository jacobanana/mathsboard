// Umami analytics loader. Injected at runtime (not a hardcoded <script> in
// index.html) so it is env-gated and works on BOTH builds: same-origin
// /umami/script.js on the self-hosted app, and an absolute URL on the static
// GitHub Pages build. Umami is cookieless and stores no PII by default, so this
// needs no consent banner.
//
// Driven by two build-time vars (unset in dev/CI, so this is a no-op there and
// nothing loads — same convention as VITE_COLLAB / VITE_APP_VERSION):
//   VITE_UMAMI_SRC         - tracker URL (e.g. /umami/script.js self-hosted,
//                            or https://<domain>/umami/script.js for Pages)
//   VITE_UMAMI_WEBSITE_ID  - the website id from the Umami dashboard

const SRC = import.meta.env.VITE_UMAMI_SRC as string | undefined;
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;

/**
 * Load the Umami tracker if configured. Called once on startup (main.tsx). With
 * either var unset the app ships zero analytics code paths that do anything.
 */
export function initAnalytics(): void {
  if (!SRC || !WEBSITE_ID) return; // not configured: dev, CI, or opted out.
  if (document.querySelector("script[data-website-id]")) return; // idempotent.
  const s = document.createElement("script");
  s.defer = true;
  s.src = SRC;
  s.setAttribute("data-website-id", WEBSITE_ID);
  document.head.appendChild(s);
}

/**
 * Record a custom event (feature usage). Safe to call unconditionally: it's a
 * no-op until the tracker has loaded, so callers never guard on it.
 *
 * Keep event names derived from an existing catalog rather than hardcoded — e.g.
 * fire `track("tool_used", { tool: id })` from the central tool-dispatch point
 * using the tool's registry id, not a literal string per call site.
 */
export function track(event: string, data?: Record<string, unknown>): void {
  const w = window as unknown as {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  };
  w.umami?.track(event, data);
}
