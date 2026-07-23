// Runtime smoke test for the PWA wiring. Serves the built dist/ under a chosen
// URL prefix (root for the VPS, a repo subpath for GitHub Pages) and drives the
// pre-installed Chromium to confirm, for BOTH boards, that: the linked manifest
// loads and parses, its name/scope/start_url/icons are the right ones, the
// service worker registers and reaches "activated", and the icons are fetchable.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const PREFIX = process.env.PREFIX || ""; // e.g. "/mathsboard"
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split("?")[0]);
    if (PREFIX && path.startsWith(PREFIX)) path = path.slice(PREFIX.length);
    if (path.endsWith("/")) path += "index.html";
    const ext = path.slice(path.lastIndexOf("."));
    const body = await readFile(dist + path.replace(/^\//, ""));
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}${PREFIX}`;

const browser = await chromium.launch({
  // Managed Chromium by default; PW_CHROMIUM overrides for pinned environments.
  executablePath: process.env.PW_CHROMIUM || undefined,
});

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "  ok " : " FAIL"}  ${name}`);
  if (!cond) failures++;
};

for (const [label, url] of [
  ["maths", `${base}/`],
  ["language", `${base}/language/`],
]) {
  console.log(`\n=== ${label} @ ${url} ===`);
  const page = await browser.newPage();
  const failedReqs = [];
  page.on("requestfailed", (r) => failedReqs.push(r.url()));
  await page.goto(url, { waitUntil: "load" });

  // Manifest: resolve the <link>, fetch it, parse it.
  const manifestHref = await page.getAttribute("link[rel=manifest]", "href");
  const manifestUrl = new URL(manifestHref, url).toString();
  const manifest = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return r.ok ? r.json() : null;
  }, manifestUrl);
  check("manifest loads & parses", !!manifest);
  if (manifest) {
    const expectName = label === "maths" ? "Maths Board" : "Language Board";
    check(`manifest.name = ${expectName}`, manifest.name === expectName);
    // scope/start_url resolve to this board's directory.
    const scope = new URL(manifest.scope, manifestUrl).toString();
    check("scope resolves to page dir", scope === url);
    const start = new URL(manifest.start_url, manifestUrl).toString();
    check("start_url resolves to page dir", start === url);
    // Every icon is actually fetchable.
    for (const icon of manifest.icons) {
      const iconUrl = new URL(icon.src, manifestUrl).toString();
      const ok = await page.evaluate(async (u) => (await fetch(u)).ok, iconUrl);
      check(`icon ${icon.sizes} fetchable`, ok);
    }
  }

  // apple-touch-icon present & fetchable.
  const appleHref = await page.getAttribute("link[rel=apple-touch-icon]", "href");
  check("apple-touch-icon linked", !!appleHref);
  if (appleHref) {
    const ok = await page.evaluate(
      async (u) => (await fetch(u)).ok,
      new URL(appleHref, url).toString(),
    );
    check("apple-touch-icon fetchable", ok);
  }

  // Service worker registers and activates.
  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return "no-registration";
    const sw = reg.active || reg.installing || reg.waiting;
    return sw ? `${sw.state} @ ${reg.scope}` : "no-worker";
  });
  console.log(`  sw: ${swState}`);
  check("service worker activated", swState.startsWith("activated"));

  check("no failed requests", failedReqs.length === 0);
  if (failedReqs.length) console.log("   failed:", failedReqs);
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
