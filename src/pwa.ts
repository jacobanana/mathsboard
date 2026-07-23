// Progressive-web-app wiring: register the offline service worker so both boards
// are installable and keep working without a network.
//
// The worker itself (public/sw.js) lives at the deployment ROOT and takes the
// root as its scope. The registration URL is derived from the page's location so
// it resolves to that root in EVERY layout:
//   • multi-domain (production): each board is served at its own domain's root,
//     so ../sw.js from the language page's root URL clamps back to /sw.js;
//   • single-origin (dev / GitHub Pages): the language page sits under
//     /language/, so ../sw.js steps up to the shared root.
// Either way the worker's default scope (its own directory) covers the board.
//
// Only registers in production builds — a caching worker in `vite dev` just gets
// in the way of hot-module reloading.
import { IS_LANGUAGE } from "@/subject";

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  // The language page is served one directory deep on the single-origin layout
  // (/language/) and at the root on its own domain; "../sw.js" resolves to
  // <root>/sw.js in both (browsers clamp ".." at "/"). The maths page is always
  // at the root, so "./sw.js" suffices.
  const swUrl = IS_LANGUAGE ? "../sw.js" : "./sw.js";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swUrl).catch((err) => {
      // Non-fatal: the app runs fine online without the worker.
      console.warn("Service worker registration failed:", err);
    });
  });
}
