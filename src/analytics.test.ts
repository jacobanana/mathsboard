// The analytics FEATURE-FLAG contract: nothing records unless the Umami tracker
// is configured (VITE_UMAMI_SRC + a website id for THIS board) AND has loaded. In
// dev/CI/test those vars are unset, so ANALYTICS_ENABLED is false, initAnalytics
// injects no script, and every event helper is a silent no-op. These tests lock
// that in so a future call site can't accidentally fire against a missing
// tracker (or leak events when the flag is off).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_ENABLED,
  identify,
  initAnalytics,
  track,
  trackBoardActivated,
} from "@/analytics";

type UmamiWin = typeof window & {
  umami?: {
    track: (...a: unknown[]) => void;
    identify: (...a: unknown[]) => void;
  };
};

afterEach(() => {
  delete (window as UmamiWin).umami;
  document
    .querySelectorAll("script[data-website-id]")
    .forEach((s) => s.remove());
});

describe("analytics feature-flag gating", () => {
  it("is disabled when the Umami env vars are unset (dev / CI / test)", () => {
    expect(ANALYTICS_ENABLED).toBe(false);
  });

  it("initAnalytics injects no tracker script while disabled", () => {
    initAnalytics({ build: "app", collab: true, version: "dev" });
    expect(document.querySelector("script[data-website-id]")).toBeNull();
  });

  it("track / identify / activation are safe no-ops before the tracker loads", () => {
    expect(() =>
      track("tool_action", { tool: "clock", action: "created" }),
    ).not.toThrow();
    expect(() => identify({ build: "app" })).not.toThrow();
    expect(() => trackBoardActivated("board-noop")).not.toThrow();
  });

  it("forwards events to window.umami once the tracker is present", () => {
    const umami = { track: vi.fn(), identify: vi.fn() };
    (window as UmamiWin).umami = umami;

    track("tool_action", { tool: "clock", action: "created" });
    expect(umami.track).toHaveBeenCalledWith("tool_action", {
      tool: "clock",
      action: "created",
    });

    identify({ build: "app", collab: true });
    expect(umami.identify).toHaveBeenCalledWith({ build: "app", collab: true });
  });

  it("board_activated fires at most once per board id", () => {
    const umami = { track: vi.fn(), identify: vi.fn() };
    (window as UmamiWin).umami = umami;

    trackBoardActivated("board-once");
    trackBoardActivated("board-once");
    expect(umami.track).toHaveBeenCalledTimes(1);
    // track() forwards (event, data); board_activated carries no data.
    expect(umami.track).toHaveBeenCalledWith("board_activated", undefined);
  });
});

// WHICH SITE each board reports into. The two boards are separate products on
// separate domains, so they are separate sites in the Umami dashboard — and the
// id is resolved at module load from the subject the URL implies, so these
// re-import the module per case rather than calling a setter that doesn't exist.
describe("per-board website id", () => {
  /** Load a fresh copy of the module as the board `path` serves, and track. */
  async function trackerFor(path: string): Promise<string | null> {
    // initAnalytics is idempotent per document, so clear the previous board's
    // script before asking for this one's.
    document
      .querySelectorAll("script[data-website-id]")
      .forEach((s) => s.remove());
    window.history.replaceState({}, "", path);
    vi.resetModules(); // re-runs subject detection AND the id table.
    const analytics = await import("@/analytics");
    analytics.initAnalytics();
    const script = document.querySelector("script[data-website-id]");
    return script?.getAttribute("data-website-id") ?? null;
  }

  beforeEach(() => {
    vi.stubEnv("VITE_UMAMI_SRC", "https://analytics.example.ch/script.js");
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "maths-site");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    window.history.replaceState({}, "", "/");
  });

  it("sends each board to its own site", async () => {
    vi.stubEnv("VITE_UMAMI_LANGUAGE_WEBSITE_ID", "language-site");
    expect(await trackerFor("/")).toBe("maths-site");
    expect(await trackerFor("/language/")).toBe("language-site");
  });

  it("falls back to the one site when no language site is configured (Pages)", async () => {
    // The static build serves both boards from one origin, so one site is the
    // whole truth there — and an unset id must not disable the language board.
    expect(await trackerFor("/language/")).toBe("maths-site");
  });

  it("stays off for a board with no site id, even with a tracker URL", async () => {
    vi.stubEnv("VITE_UMAMI_WEBSITE_ID", "");
    expect(await trackerFor("/")).toBeNull();
  });
});
