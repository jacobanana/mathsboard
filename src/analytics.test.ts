// The analytics FEATURE-FLAG contract: nothing records unless the Umami tracker
// is configured (VITE_UMAMI_SRC + VITE_UMAMI_WEBSITE_ID) AND has loaded. In
// dev/CI/test those vars are unset, so ANALYTICS_ENABLED is false, initAnalytics
// injects no script, and every event helper is a silent no-op. These tests lock
// that in so a future call site can't accidentally fire against a missing
// tracker (or leak events when the flag is off).

import { afterEach, describe, expect, it, vi } from "vitest";
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
