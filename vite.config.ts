import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Served from https://jacobanana.github.io/mathsboard/ on GitHub Pages.
  // Use a relative base so built asset URLs work under the repo subpath.
  base: "./",
  plugins: [react()],
  build: {
    // Two pages off ONE app: the maths board at / and the language board at
    // /language/. Both load src/main.tsx, which assembles the right tool set
    // from the page path (src/subject.ts). Multi-page so static hosting serves
    // a real file at /language/ — no SPA-fallback / server rewrite needed.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        language: fileURLToPath(new URL("./language/index.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      // Resolved relative to this config file's URL; avoids needing Node type
      // declarations (@types/node) just for `fileURLToPath`.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Dev-time collaboration: proxy the backend routes to the local compose
    // stack (docker compose -f docker-compose.yml -f docker-compose.local.yml
    // up), which serves them on :8080. Without that stack running the app
    // works exactly as before - these only matter once you press Share.
    proxy: {
      "/api": "http://localhost:8080",
      "/ys": { target: "http://localhost:8080", ws: true },
    },
  },
});

/** Minimal local shim for node:url's fileURLToPath (no @types/node needed). */
function fileURLToPath(url: URL): string {
  let p = decodeURIComponent(url.pathname);
  // On Windows the pathname is "/C:/...": strip the leading slash.
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p;
}
