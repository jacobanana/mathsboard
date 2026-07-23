// Progressive-web-app wiring: register the shared offline service worker so both
// boards are installable and keep working without a network.
//
// The worker itself (public/sw.js) lives at the deployment ROOT and takes the
// root as its scope, so it covers the Maths board (served at the root) and the
// Language board (served under /language/). The page path therefore decides the
// RELATIVE URL we register it under: the language page is one directory deeper.
//
// Only registers in production builds — a caching worker in `vite dev` just gets
// in the way of hot-module reloading.
import { IS_LANGUAGE } from "@/subject";

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  // From the root page sw.js sits alongside index.html; from /language/ it is
  // one level up. Either way it resolves to <deployment-root>/sw.js, whose
  // default scope (its own directory) is the deployment root — covering both
  // boards with one registration.
  const swUrl = IS_LANGUAGE ? "../sw.js" : "./sw.js";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swUrl).catch((err) => {
      // Non-fatal: the app runs fine online without the worker.
      console.warn("Service worker registration failed:", err);
    });
  });
}
