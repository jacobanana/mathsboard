// Viewport / camera behaviours: anchored zoom, scale clamping, and the
// two-finger pinch keeping the world under the fingers.

import { beforeEach, describe, expect, it } from "vitest";
import { panBy, startPinch, updatePinch, zoomAt } from "@/canvas/viewport";
import { MAX_SCALE, MIN_SCALE, screenToWorld } from "@/board/geometry";
import { useBoardStore } from "@/board/store";
import { freshBoard } from "@/testing/fixtures";

const cam = () => useBoardStore.getState().camera;

beforeEach(() => {
  freshBoard();
});

describe("zoomAt", () => {
  it("keeps the world point under the anchor fixed while zooming", () => {
    useBoardStore.getState().setCamera({ x: 40, y: -20, scale: 1.2 });
    const before = screenToWorld(cam(), 300, 200);

    zoomAt(1.5, 300, 200);

    expect(cam().scale).toBeCloseTo(1.8, 9);
    const after = screenToWorld(cam(), 300, 200);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("clamps the scale to [MIN_SCALE, MAX_SCALE]", () => {
    zoomAt(1000, 0, 0);
    expect(cam().scale).toBe(MAX_SCALE);
    zoomAt(0.000001, 0, 0);
    expect(cam().scale).toBe(MIN_SCALE);
  });
});

describe("panBy", () => {
  it("translates the camera by a screen-space delta", () => {
    panBy(15, -8);
    panBy(5, 3);
    expect(cam()).toMatchObject({ x: 20, y: -5 });
  });
});

describe("pinch", () => {
  it("scales by the finger-distance ratio and keeps the world midpoint under the fingers", () => {
    const g = startPinch({ x: 100, y: 100 }, { x: 300, y: 100 });

    // Fingers spread to double the distance and drift together.
    const p1 = { x: 50, y: 150 };
    const p2 = { x: 450, y: 150 };
    updatePinch(g, p1, p2);

    expect(cam().scale).toBeCloseTo(2, 9);
    const midWorld = screenToWorld(cam(), 250, 150);
    expect(midWorld.x).toBeCloseTo(g.worldMid.x, 9);
    expect(midWorld.y).toBeCloseTo(g.worldMid.y, 9);
  });

  it("clamps the pinch scale too", () => {
    const g = startPinch({ x: 0, y: 0 }, { x: 10, y: 0 });
    updatePinch(g, { x: 0, y: 0 }, { x: 10000, y: 0 });
    expect(cam().scale).toBe(MAX_SCALE);
  });
});
