// THE BOARD SUBJECT — which flavour of the app this page is.
//
// This module does ONLY the detection: it resolves the subject once, at module
// load, from the page's path — the production build emits a real page at
// language/index.html (see vite.config.ts) and the dev server serves it at
// /language/. What each subject looks like and is equipped with (chrome wording,
// default paper, dock tools) lives in src/boardProfile.ts, keyed by the Subject
// resolved here — so config is one table, not scattered `if` checks.

export type Subject = "maths" | "language";

/** True when the current page path is the language board (…/language/…). */
function detectSubject(): Subject {
  // Guard for non-browser contexts (should not happen in the app, but keeps
  // the module import-safe under tooling that has no window/location).
  const path =
    typeof window !== "undefined" && window.location
      ? window.location.pathname
      : "";
  return /(^|\/)language(\/|$|\.html$)/.test(path) ? "language" : "maths";
}

export const SUBJECT: Subject = detectSubject();
export const IS_LANGUAGE = SUBJECT === "language";
