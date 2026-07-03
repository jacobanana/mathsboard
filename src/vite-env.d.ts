/// <reference types="vite/client" />

// Typed access to our build-time env vars (see src/config.ts). Merges onto
// Vite's built-in ImportMetaEnv.
interface ImportMetaEnv {
  /** "0" disables collaboration + image upload (the static GitHub Pages build). */
  readonly VITE_COLLAB?: string;
}
