import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/tools"; // populate the tool registry before first render.
import "@/testing/e2eHooks"; // read-only window hooks for the e2e tests.
import "@/styles/index.css";
import { logVersions } from "@/version";
import { initAnalytics } from "@/analytics";

logVersions();
initAnalytics();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
