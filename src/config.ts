// Build-time feature flags.
//
// COLLAB_ENABLED gates every feature that needs the backend server:
//   - live collaboration: Share / Join / presence (the /api/token -> Y-Sweet
//     provider), and share-link (?board=<code>) auto-join;
//   - image upload (the Picture tool POSTs to /api/upload).
//
// It is ON for the full self-hosted build (docker compose serves the backend)
// and OFF for the static GitHub Pages build, which has no server. With it OFF
// the app is a fully-working SINGLE-USER whiteboard: solo mode is a local
// Y.Doc with no network (see src/collab/session.ts) and drafts/boards persist
// in localStorage, so nothing about the core drawing/maths tools changes.
//
// Driven by the VITE_COLLAB env var at build time: set VITE_COLLAB=0 to
// disable (the Pages deploy workflow does this). Anything else — including
// unset — leaves collaboration enabled, so local dev and the self-hosted
// build need no configuration.
export const COLLAB_ENABLED = import.meta.env.VITE_COLLAB !== "0";
