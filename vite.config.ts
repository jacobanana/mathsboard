import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { CONTENT_SCHEMA, CONTENT_SCHEMA_PATH } from "./src/lang/content/schema";

// Minimal local shim, in the same spirit as fileURLToPath below: reading two
// env vars is not worth pulling @types/node into this project's compile.
declare const process: { env: Record<string, string | undefined> };

// Where the dev server sends the collaboration backend routes. Two shapes:
//
//   compose stack   Caddy fronts everything on :8080 and strips /ys itself
//                   before proxying to the y-sweet container. The default,
//                   and what docker-compose.local.yml documents.
//   local stack     scripts/start_app.sh runs the token API and y-sweet as
//                   plain processes (no Docker, which a cloud dev container
//                   has no daemon for). It exports MB_API_TARGET/MB_YS_TARGET
//                   to point here — and a bare y-sweet serves at its ROOT, so
//                   this side has to strip the /ys prefix Caddy would have.
const STACK_ORIGIN = "http://localhost:8080";
const apiTarget = process.env.MB_API_TARGET ?? STACK_ORIGIN;
const ysTarget = process.env.MB_YS_TARGET;

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
    // Dev-time collaboration: proxy the backend routes to whichever backend is
    // running (see STACK_ORIGIN above). Without one the app works exactly as
    // before - these only matter once you press Share or insert a picture.
    proxy: {
      // xfwd adds the X-Forwarded-* headers Caddy would have. The token
      // endpoint reads them to decide which origin to put inside a minted
      // token: without them it sees only its own host and hands the browser a
      // websocket URL on the API's port, which nothing is listening for.
      "/api": { target: apiTarget, xfwd: true },
      "/ys": ysTarget
        ? {
            target: ysTarget,
            ws: true,
            xfwd: true,
            // A bare y-sweet serves at its root; Caddy's /ys route strips the
            // prefix itself, so this side only strips when there is no Caddy.
            rewrite: (p) => p.replace(/^\/ys/, ""),
          }
        : { target: STACK_ORIGIN, ws: true, xfwd: true },
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
