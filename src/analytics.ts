// Umami analytics loader + the app's custom-event surface. Injected at runtime
// (not a hardcoded <script> in index.html) so it is env-gated and works on BOTH
// builds: the self-hosted app and the static GitHub Pages build. Umami is
// cookieless and stores no PII by default, so this needs no consent banner.
//
// FEATURE-FLAG GATING (one gate, checked once here): everything is off unless
// BOTH the tracker URL and a website id for THIS board are set (unset in
// dev/CI, so this is a no-op there and nothing loads — same convention as
// VITE_COLLAB / VITE_APP_VERSION):
//   VITE_UMAMI_SRC                   - tracker URL, e.g.
//                                      https://<analytics domain>/script.js
//   VITE_UMAMI_WEBSITE_ID            - website id of the maths board's site
//   VITE_UMAMI_LANGUAGE_WEBSITE_ID   - website id of the language board's site
//
// Their values live in deploy/analytics.env, committed, and reach the bundle
// through the two build workflows. See that file for why they are not repo
// variables.
//
// With the flag OFF: initAnalytics() injects no script, so `window.umami` never
// exists, so track()/identify() are no-ops (optional chaining), and callers that
// branch on ANALYTICS_ENABLED (e.g. share-link UTM tagging) skip their work.
// Callers therefore NEVER need to guard a track() call themselves.

import { SUBJECT, type Subject } from "@/subject";

const SRC = import.meta.env.VITE_UMAMI_SRC;

/**
 * Which Umami site each board reports into. The maths board and the language
 * board are separate PRODUCTS on separate domains (see CLAUDE.md), so they are
 * separate sites in the dashboard — one shared id would blend a maths lesson's
 * traffic into the language board's reports and leave neither answerable.
 *
 * A table keyed by Subject rather than an `if (IS_LANGUAGE)` here: a third
 * board type is one more entry, the same shape as PROFILES in boardProfile.ts.
 *
 * The language board falls back to the single id when it has none of its own,
 * which is the GitHub Pages case: one origin serving both boards, one site.
 */
const WEBSITE_IDS: Record<Subject, string | undefined> = {
  maths: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  language:
    import.meta.env.VITE_UMAMI_LANGUAGE_WEBSITE_ID ||
    import.meta.env.VITE_UMAMI_WEBSITE_ID,
};

/** The site THIS page reports into — the board it is, not the build it is in. */
const WEBSITE_ID = WEBSITE_IDS[SUBJECT];

/**
 * The single analytics feature flag: true only when the tracker is configured
 * for this board (a URL, and a website id this board reports into).
 * Use it to gate WORK that would otherwise run even though nothing records it
 * (building a payload, tagging a URL) — not to guard track()/identify(), which
 * are already no-ops when the tracker isn't loaded.
 */
export const ANALYTICS_ENABLED = Boolean(SRC && WEBSITE_ID);

/**
 * Load the Umami tracker if configured, then attach `session` properties (build,
 * version, collab) to the session via identify once the script is live. Called
 * once on startup (main.tsx). With the flag off the app ships zero analytics
 * code paths that do anything.
 */
export function initAnalytics(session?: Record<string, unknown>): void {
  if (!ANALYTICS_ENABLED) return; // not configured: dev, CI, or opted out.
  if (document.querySelector("script[data-website-id]")) return; // idempotent.
  const s = document.createElement("script");
  s.defer = true;
  s.src = SRC as string;
  s.setAttribute("data-website-id", WEBSITE_ID as string);
  // identify() only exists once the tracker has loaded, so defer it to onload
  // rather than racing the async script. Attributes persist for the session.
  if (session && Object.keys(session).length > 0) {
    s.addEventListener("load", () => identify(session), { once: true });
  }
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

/**
 * Attach persistent properties to the current session (Umami "identify"). Used
 * for low-cardinality segmentation keys — build (app vs static), app version,
 * collab-enabled — so every report can be filtered by them. Same no-op-until-
 * loaded contract as track(); called from initAnalytics on script load.
 */
export function identify(data: Record<string, unknown>): void {
  const w = window as unknown as {
    umami?: { identify: (data: Record<string, unknown>) => void };
  };
  w.umami?.identify(data);
}

/**
 * Fire `board_activated` the FIRST time a given board gets real content (first
 * stroke or first placed widget), and never again for that board this session.
 * The dedup set lives here so both activation seams (store.addStroke and
 * commands.placeObject) share one definition of "already activated".
 */
const activatedBoards = new Set<string>();
export function trackBoardActivated(boardId: string): void {
  if (activatedBoards.has(boardId)) return;
  activatedBoards.add(boardId);
  track("board_activated");
}
