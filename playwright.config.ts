import { defineConfig, devices } from "@playwright/test";

// The system under test is the full local compose topology - Caddy serving the
// production build + the token API + Y-Sweet + MinIO - i.e. exactly the stack
// docker-compose.local.yml documents for manual end-to-end testing, on :8080.
//
//   CI      starts the stack itself and points the tests at it via
//           PLAYWRIGHT_BASE_URL (see .github/workflows/e2e.yml).
//   local   `npm run test:e2e` boots the stack through webServer below
//           (requires Docker). A stack you already have running is reused;
//           note the web image bakes the frontend in, so REBUILD after
//           changing src/:
//             docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
//           and stop everything with `... down` when you're finished.

// 127.0.0.1, not localhost: on Windows, localhost resolves to ::1 first and
// Docker Desktop's port forward is only dependable on IPv4 - with "localhost"
// the webServer health check below can wrongly conclude the stack is down,
// boot a second `compose up`, and tear the stack down when the run ends.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Modest parallelism on purpose: every test opens 1-2 real websocket
  // clients against one shared backend, and a burst of simultaneous Chromium
  // launches has been seen stalling first navigations (Docker Desktop port
  // proxying / AV scanning). The suite is small; 2 workers keep it quick.
  workers: 2,
  forbidOnly: !!process.env.CI,
  // Tests ride a real websocket + sync server; allow CI one retry for network
  // burps before calling it a failure.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:
          "docker compose -f docker-compose.yml -f docker-compose.local.yml up --build",
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 600_000,
      },
});
