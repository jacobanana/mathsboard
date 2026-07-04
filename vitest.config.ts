// Unit/behavioural test runner config. Merges the app's vite config so the
// "@/" alias and import.meta.env behave exactly as in the real build; the
// jsdom environment supplies window/document/localStorage for the store,
// persistence and shortcut layers. Rendering is NOT under test here (see
// src/testing/vitestSetup.ts for the one canvas stub) — pixels belong to the
// Playwright e2e suite in e2e/.

import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts"],
      setupFiles: ["./src/testing/vitestSetup.ts"],
    },
  }),
);
