// The 2D hourglass geometry: the glass path is well-formed, and the sand surface
// levels are bounded by the glass and monotonic in the elapsed fraction.

import { describe, expect, it } from "vitest";
import {
  BOT_RIM_Y,
  GLASS_PATH,
  NECK_Y,
  TOP_RIM_Y,
  sandBottomSurfaceY,
  sandTopSurfaceY,
} from "@/tools/timer/hourglass";

describe("glass path", () => {
  it("is a closed SVG path string", () => {
    expect(typeof GLASS_PATH).toBe("string");
    expect(GLASS_PATH.startsWith("M")).toBe(true);
    expect(GLASS_PATH.trim().endsWith("Z")).toBe(true);
  });
});

describe("top-bulb sand surface", () => {
  it("drains from the rim to the neck as f runs 0→1", () => {
    expect(sandTopSurfaceY(0)).toBeCloseTo(TOP_RIM_Y);
    expect(sandTopSurfaceY(1)).toBeCloseTo(NECK_Y);
  });
  it("descends monotonically and stays within the top bulb", () => {
    expect(sandTopSurfaceY(0.3)).toBeLessThan(sandTopSurfaceY(0.7));
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = sandTopSurfaceY(f);
      expect(y).toBeGreaterThanOrEqual(TOP_RIM_Y);
      expect(y).toBeLessThanOrEqual(NECK_Y);
    }
  });
  it("clamps outside [0,1]", () => {
    expect(sandTopSurfaceY(-1)).toBeCloseTo(TOP_RIM_Y);
    expect(sandTopSurfaceY(2)).toBeCloseTo(NECK_Y);
  });
});

describe("bottom-bulb sand surface", () => {
  it("fills from the floor to the neck as f runs 0→1", () => {
    expect(sandBottomSurfaceY(0)).toBeCloseTo(BOT_RIM_Y);
    expect(sandBottomSurfaceY(1)).toBeCloseTo(NECK_Y);
  });
  it("rises monotonically and stays within the bottom bulb", () => {
    expect(sandBottomSurfaceY(0.7)).toBeLessThan(sandBottomSurfaceY(0.3));
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = sandBottomSurfaceY(f);
      expect(y).toBeGreaterThanOrEqual(NECK_Y);
      expect(y).toBeLessThanOrEqual(BOT_RIM_Y);
    }
  });
});
