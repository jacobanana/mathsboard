// THE BOARD SUBJECT — which flavour of the app this page is, and how the two
// flavours map onto URLs.
//
// DETECTION resolves the subject once, at module load, from the page's path —
// the production build emits a real page at language/index.html (see
// vite.config.ts) and the dev server serves it at /language/. What each subject
// looks like and is equipped with (chrome wording, default paper, dock tools)
// lives in src/boardProfile.ts, keyed by the Subject resolved here — so config
// is one table, not scattered `if` checks.
//
// ROUTING (pathForSubject / crossAppRedirect) is the inverse: given a subject,
// which path serves it. A shared board carries its subject in its synced meta,
// so a board opened in the wrong flavour (a hand-typed Join code, or a link
// whose /language/ segment got lost) can hand off to the correct app.

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

/**
 * Every subject the app ships. The one place code that must ENUMERATE subjects
 * reads (e.g. the persistence layer, which reserves a per-subject draft key for
 * each). Adding a future board type = add its `Subject` here and one PROFILES
 * entry (src/boardProfile.ts); nothing else hand-lists the subjects.
 */
export const SUBJECTS: readonly Subject[] = ["maths", "language"];

/**
 * The pathname that serves `subject`, derived from a given page path by
 * toggling the one `/language/` segment `detectSubject` keys off — the exact
 * inverse of detection. Preserves whatever base the deployment runs under (the
 * app is at "/" locally but under a repo subpath on GitHub Pages) and any
 * trailing "index.html", because it only adds or removes that segment. So a
 * redirect built on top of it keeps the base and the ?board=<code> query
 * intact.
 */
export function pathForSubject(subject: Subject, pathname: string): string {
  // Split off a trailing filename ("index.html") from the directory, so the
  // language segment is toggled on the DIRECTORY regardless of the file form.
  const lastSlash = pathname.lastIndexOf("/");
  const lastSeg = pathname.slice(lastSlash + 1);
  const file = lastSeg.includes(".") ? lastSeg : "";
  let dir = file ? pathname.slice(0, lastSlash + 1) : pathname;
  if (!dir.endsWith("/")) dir += "/";
  // Normalise to the maths (base) directory, then re-add the segment if wanted.
  dir = dir.replace(/language\/$/, "");
  return (subject === "language" ? `${dir}language/` : dir) + file;
}

/**
 * The URL to hand off to when a shared board just joined turns out to belong to
 * the OTHER flavour — so a language board opened in the maths app bounces to the
 * language app (and vice versa) with its ?board=<code> query carried along.
 * Returns null when no redirect is needed: the board is already this app's
 * subject, or its subject is UNKNOWN — a legacy shared board saved before the
 * subject field carries none in its meta, and since that's indistinguishable
 * from a not-yet-synced board we never bounce it.
 */
export function crossAppRedirect(
  boardSubject: Subject | undefined,
  href: string,
  currentSubject: Subject = SUBJECT,
): string | null {
  if (!boardSubject || boardSubject === currentSubject) return null;
  const url = new URL(href);
  url.pathname = pathForSubject(boardSubject, url.pathname);
  return url.toString();
}
