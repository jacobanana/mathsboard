/// <reference types="vite/client" />

// Typed access to our build-time env vars (see src/config.ts and
// src/analytics.ts). Merges onto Vite's built-in ImportMetaEnv.
interface ImportMetaEnv {
  /** "0" disables collaboration + image upload (the static GitHub Pages build). */
  readonly VITE_COLLAB?: string;
  /** Build version, e.g. "2026.07.04-c50b64e" (see .github/actions/app-version). Unset in dev. */
  readonly VITE_APP_VERSION?: string;
  /** Umami tracker URL, e.g. "https://<analytics domain>/script.js". Unset in dev = analytics off. */
  readonly VITE_UMAMI_SRC?: string;
  /** Umami website id of the maths board's site (and the Pages build's single site). */
  readonly VITE_UMAMI_WEBSITE_ID?: string;
  /** Umami website id of the language board's site. Unset = the language board falls back to the id above. */
  readonly VITE_UMAMI_LANGUAGE_WEBSITE_ID?: string;
}
