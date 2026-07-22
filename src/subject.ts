// THE BOARD SUBJECT — which flavour of the app this page is.
//
// The whole board (canvas, toolbar, collaboration, persistence) is shared; the
// only thing that changes between flavours is WHICH tools the Insert gallery
// offers and a little chrome wording. "maths" is the original whiteboard;
// "language" is the vocabulary / translation board served at /language/.
//
// The subject is decided ONCE, at module load, from the page's path — the
// production build emits a real page at language/index.html (see vite.config.ts)
// and the dev server serves it at /language/. Everything downstream imports the
// resolved constants rather than re-parsing the URL, so there is a single seam.

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

/** App name shown in the welcome screen and the document title. */
export const APP_NAME = IS_LANGUAGE ? "Language Board" : "Maths Board";

/** The Insert button's tooltip / gallery verb, so the dock reads naturally in
 *  each flavour ("Insert a maths widget" vs "Insert a language activity"). */
export const INSERT_NOUN = IS_LANGUAGE ? "language activity" : "maths widget";
