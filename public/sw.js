// Offline service worker — shared by BOTH boards (Maths at the deployment root,
// Language under /language/). Its scope is the deployment root, so a single
// registration covers both installed apps; they remain distinct apps (separate
// manifests / start URLs / home-screen icons) that merely share this cache.
//
// Strategy:
//   • navigations       -> network-first, falling back to the cached page (and
//                          then to any cached shell) so the app opens offline.
//   • same-origin GETs   -> stale-while-revalidate: serve the cached copy at once
//                          and refresh it in the background. Hashed build assets
//                          are immutable, so this is safe and self-healing.
//   • backend + WebSocket routes (/api/, /ys/) are never touched — collaboration
//     must always hit the network.
//
// This file is plain static JS (in public/); it is NOT part of the Vite bundle,
// so keep it dependency-free. Bump CACHE_VERSION to force old caches out.
const CACHE_VERSION = "v1";
const CACHE = `mathsboard-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Backend routes that must always go straight to the network. */
function isBackend(url) {
  return /(^|\/)(api|ys)\//.test(url.pathname);
}

// Store a response without ever surfacing an unhandled rejection. Cache.put()
// rejects with "Cache.put() encountered a network error" whenever it can't
// commit the whole body: a 206 partial (media Range requests), an opaque or
// redirected response, a stream aborted because the page navigated away
// mid-fetch, or quota being exceeded. None of those are worth crashing a
// promise over — we just skip caching that one response. Callers pass a clone
// and DON'T await this (it never rejects), so a failed write stays silent.
async function putInCache(cache, req, res) {
  // Only cache full, cacheable GETs: 200 OK, non-opaque, non-range.
  if (!res || res.status !== 200 || res.type === "opaque") return;
  if (req.headers.has("range")) return;
  try {
    await cache.put(req, res);
  } catch {
    // Aborted stream, partial body, or storage quota — non-fatal, ignore.
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // e.g. analytics, CDNs
  if (isBackend(url)) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) putInCache(cache, req, res.clone());
    return res;
  } catch {
    // Offline: the exact page if we have it, else any cached page shell.
    const hit = await cache.match(req);
    if (hit) return hit;
    const shell =
      (await cache.match("./")) ||
      (await cache.match("index.html")) ||
      (await cache.match("language/"));
    if (shell) return shell;
    throw new Error("offline and no cached shell");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) putInCache(cache, req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || fetch(req);
}
