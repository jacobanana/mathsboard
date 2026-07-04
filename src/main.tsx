import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/tools"; // populate the tool registry before first render.
import "@/testing/e2eHooks"; // read-only window hooks for the e2e tests.
import "@/styles/index.css";
import { logVersions, FRONTEND_VERSION } from "@/version";
import { initAnalytics } from "@/analytics";
import { COLLAB_ENABLED } from "@/config";

logVersions();
// Session properties for Umami: which build (full app vs static Pages), whether
// collaboration is compiled in, and the exact frontend version — so every
// report can be segmented by them. No-op unless the analytics flag is set.
initAnalytics({
  build: COLLAB_ENABLED ? "app" : "static",
  collab: COLLAB_ENABLED,
  version: FRONTEND_VERSION,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
