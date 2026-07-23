// THE BOARD SUBJECT — which flavour of the app this page is, and how the two
// flavours map onto URLs.
//
// DETECTION resolves the subject once, at module load. There are TWO layouts:
//
//   • MULTI-DOMAIN (production): each board has its OWN domain
//     (mathsboard.mixedmode.ch / languageboard.mixedmode.ch). The leftmost DNS
//     label is authoritative — see boardHostSubject.
//   • SINGLE-ORIGIN (local dev, GitHub Pages, e2e): both boards share one origin
//     and the `/language/` path segment selects. The production build emits a
//     real page at language/index.html (see vite.config.ts) and the dev server
//     serves it at /language/.
//
// What each subject looks like and is equipped with (chrome wording, default
// paper, dock tools) lives in src/boardProfile.ts, keyed by the Subject resolved
// here — so config is one table, not scattered `if` checks.
//
// ROUTING (pathForSubject / hostForSubject / crossAppRedirect) is the inverse:
// given a subject, which URL serves it. A shared board carries its subject in
// its synced meta, so a board opened in the wrong flavour (a hand-typed Join
// code, or a link whose domain/segment got lost) can hand off to the correct
// app — across domains on production, across paths otherwise.

export type Subject = "maths" | "language";

/**
 * Every subject the app ships. The one place code that must ENUMERATE subjects
 * reads (e.g. the persistence layer, which reserves a per-subject draft key for
 * each). Adding a future board type = add its `Subject` here and one PROFILES
 * entry (src/boardProfile.ts); nothing else hand-lists the subjects.
 */
export const SUBJECTS: readonly Subject[] = ["maths", "language"];

/**
 * Each subject's own subdomain label on the multi-domain production deploy
 * (mathsboard.mixedmode.ch / languageboard.mixedmode.ch). The leftmost DNS
 * label of a "board host" names its subject; every other origin (localhost, the
 * GitHub Pages host) is not a board host and falls back to path selection.
 */
const HOST_LABELS: Record<Subject, string> = {
  maths: "mathsboard",
  language: "languageboard",
};

/**
 * The subject a "board host" serves, or null when `hostname` isn't one. On the
 * production deploy each board lives on its own domain, so the host alone
 * decides the flavour; anywhere else this returns null and the caller falls
 * back to the single-origin `/language/` path rule.
 */
function boardHostSubject(hostname: string): Subject | null {
  const label = hostname.split(".")[0];
  return SUBJECTS.find((s) => label === HOST_LABELS[s]) ?? null;
}

function detectSubject(): Subject {
  // Guard for non-browser contexts (should not happen in the app, but keeps
  // the module import-safe under tooling that has no window/location).
  if (typeof window === "undefined" || !window.location) return "maths";
  const { hostname, pathname } = window.location;
  // Production: the domain is authoritative.
  const byHost = boardHostSubject(hostname);
  if (byHost) return byHost;
  // Single-origin layouts: the /language/ segment selects.
  return /(^|\/)language(\/|$|\.html$)/.test(pathname) ? "language" : "maths";
}

export const SUBJECT: Subject = detectSubject();
export const IS_LANGUAGE = SUBJECT === "language";

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
 * Swap a board host's leftmost DNS label so it serves `subject`, preserving the
 * rest of the domain — mathsboard.mixedmode.ch <-> languageboard.mixedmode.ch.
 * Only meaningful for hosts boardHostSubject recognises (the multi-domain
 * deploy); crossAppRedirect gates on that before calling it.
 */
export function hostForSubject(subject: Subject, hostname: string): string {
  return [HOST_LABELS[subject], ...hostname.split(".").slice(1)].join(".");
}

/**
 * The URL to hand off to when a shared board just joined turns out to belong to
 * the OTHER flavour — so a language board opened in the maths app bounces to the
 * language app (and vice versa) with its ?board=<code> query carried along.
 *
 * On the multi-domain deploy the hand-off swaps the DOMAIN (each board serves at
 * its own domain's root); on a single-origin layout it toggles the `/language/`
 * PATH segment. Returns null when no redirect is needed: the board is already
 * this app's subject, or its subject is UNKNOWN — a legacy shared board saved
 * before the subject field carries none in its meta, and since that's
 * indistinguishable from a not-yet-synced board we never bounce it.
 */
export function crossAppRedirect(
  boardSubject: Subject | undefined,
  href: string,
  currentSubject: Subject = SUBJECT,
): string | null {
  if (!boardSubject || boardSubject === currentSubject) return null;
  const url = new URL(href);
  if (boardHostSubject(url.hostname)) {
    // Multi-domain: hand off to the other board's domain. Each domain serves its
    // board at the root, so drop the path; the ?board=<code> query rides along.
    url.hostname = hostForSubject(boardSubject, url.hostname);
    url.pathname = "/";
  } else {
    url.pathname = pathForSubject(boardSubject, url.pathname);
  }
  return url.toString();
}
