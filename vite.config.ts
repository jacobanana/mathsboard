import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { CONTENT_SCHEMA, CONTENT_SCHEMA_PATH } from "./src/lang/content/schema";

export default defineConfig({
  // Served from https://jacobanana.github.io/mathsboard/ on GitHub Pages.
  // Use a relative base so built asset URLs work under the repo subpath.
  base: "./",
  plugins: [react(), contentSchemaFile()],
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

/** Publishes the content-pack JSON Schema as a real file at the URL it names as
 *  its `$id` (/schemas/language-content.schema.json). Every pack — the built-in
 *  one included — carries that URL in its `$schema` field, so without a file
 *  there the SPA fallback answers with index.html: editors and validators get
 *  an HTML page, and the browser reports it as a MIME-type error.
 *
 *  Generated from CONTENT_SCHEMA rather than a checked-in copy, so the
 *  published schema can never drift from the one the app validates against and
 *  the help page hands out. Emitted into the build for every deployment target
 *  and served by the dev server too, so the link resolves the same way locally. */
function contentSchemaFile(): Plugin {
  const body = JSON.stringify(CONTENT_SCHEMA, null, 2) + "\n";
  return {
    name: "mathsboard:content-schema",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/" + CONTENT_SCHEMA_PATH) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: CONTENT_SCHEMA_PATH, source: body });
    },
  };
}

/** Minimal local shim for node:url's fileURLToPath (no @types/node needed). */
function fileURLToPath(url: URL): string {
  let p = decodeURIComponent(url.pathname);
  // On Windows the pathname is "/C:/...": strip the leading slash.
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
  return p;
}
