// The laser pointer is now a TOGGLE on the pointer (Select) tool, not a tool of
// its own. These tests drive the real selectController with store.laserMode on,
// and exercise the receiver-side camera math that a peer's focus command runs.
// jsdom has no 2D canvas, so overlay drawing is asserted through a spy kit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/tools";
import { selectController } from "@/canvas/interactions/select";
import {
  applyLaserFocus,
  isWorldPointVisible,
} from "@/canvas/viewport";
import { useBoardStore } from "@/board/store";
import { anObject, fakeInputCtx, freshBoard, pointer } from "@/testing/fixtures";
import type { OverlayKit } from "@/canvas/interactions/types";
import type { AnyBoardObject } from "@/board/types";
import { theme } from "@/styles/theme";

// jsdom (vitest) has no requestAnimationFrame; the laser throttles its awareness
// publish on it. Solo mode makes that publish a no-op, so a non-firing stub is
// enough to exercise the gesture + overlay logic.
globalThis.requestAnimationFrame ??= (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= (() => {}) as typeof cancelAnimationFrame;

const st = () => useBoardStore.getState();
const ctx = fakeInputCtx();

const down = (x: number, y: number, o?: { shiftKey?: boolean }) =>
  selectController.onPointerDown(pointer(x, y, o), ctx);
const move = (x: number, y: number) =>
  selectController.onPointerMove(pointer(x, y, { type: "pointermove" }), ctx);
const up = (x: number, y: number, o?: { shiftKey?: boolean }) =>
  selectController.onPointerUp(pointer(x, y, { ...o, type: "pointerup" }), ctx);

/** A spy ink context recording the draw calls the overlay makes. */
function spyKit(): { kit: OverlayKit; ink: Record<string, ReturnType<typeof vi.fn>> } {
  const ink = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
  };
  const kit: OverlayKit = {
    back: {} as CanvasRenderingContext2D,
    ink: ink as unknown as CanvasRenderingContext2D,
    camera: { x: 0, y: 0, scale: 1 },
    theme,
  };
  return { kit, ink };
}

/** A #stage element with a fixed box (jsdom reports 0×0 otherwise). */
function mountStage(W: number, H: number): void {
  const el = document.createElement("div");
  el.id = "stage";
  el.getBoundingClientRect = () =>
    ({ width: W, height: H, top: 0, left: 0, right: W, bottom: H, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(el);
}

describe("laser as a toggle on the pointer tool", () => {
  let O: AnyBoardObject;
  beforeEach(() => {
    O = anObject({ x: 100, y: 100 });
    freshBoard({ objects: [O] });
    st().setTool("select");
    st().setLaserMode(true);
  });
  afterEach(() => selectController.cancel?.(ctx));

  it("a laser press on an object neither selects nor modifies it", () => {
    down(120, 110);
    up(120, 110);
    expect(st().selection).toEqual({ objectIds: [], strokeIds: [] });
    expect(st().canUndo).toBe(false);
    expect(st().board.objects).toHaveLength(1);
  });

  it("a laser drag never moves an object (writes nothing)", () => {
    down(120, 110);
    move(300, 300);
    up(300, 300);
    const o = st().board.objects[0];
    expect({ x: o.x, y: o.y }).toEqual({ x: 100, y: 100 });
    expect(st().canUndo).toBe(false);
  });

  it("draws the comet while a laser drag is live, nothing once released", () => {
    down(120, 110);
    move(160, 130);
    const live = spyKit();
    selectController.drawOverlay!(live.kit, ctx);
    expect(live.ink.arc).toHaveBeenCalled(); // the glowing head

    up(160, 130);
    const idle = spyKit();
    selectController.drawOverlay!(idle.kit, ctx);
    expect(idle.ink.arc).not.toHaveBeenCalled();
  });

  it("shift-drag frames an area (dashed rect) instead of a comet", () => {
    down(120, 110, { shiftKey: true });
    move(260, 230);
    const k = spyKit();
    selectController.drawOverlay!(k.kit, ctx);
    expect(k.ink.strokeRect).toHaveBeenCalled();
    expect(k.ink.arc).not.toHaveBeenCalled();
    up(260, 230, { shiftKey: true });
  });

  it("the frame toggle lets a plain drag frame an area (no Shift), then disarms", () => {
    st().setLaserFrame(true);
    down(120, 110); // no shiftKey — the toggle stands in for Shift
    move(260, 230);
    const k = spyKit();
    selectController.drawOverlay!(k.kit, ctx);
    expect(k.ink.strokeRect).toHaveBeenCalled(); // framed, not a comet
    expect(k.ink.arc).not.toHaveBeenCalled();
    up(260, 230);
    expect(st().laserFrame).toBe(false); // one area framed → back to pointing
  });

  it("a tap with the frame toggle armed makes no area and stays armed", () => {
    st().setLaserFrame(true);
    down(120, 110);
    up(120, 110);
    expect(st().laserFrame).toBe(true);
  });

  it("turning the laser off disarms the frame toggle", () => {
    st().setLaserFrame(true);
    st().setLaserMode(false);
    expect(st().laserFrame).toBe(false);
  });

  it("draws the comet in the chosen laser colour", () => {
    st().setLaserColor("#12d64a"); // green
    down(120, 110);
    move(160, 130);
    const k = spyKit();
    selectController.drawOverlay!(k.kit, ctx);
    // The translucent tail is stroked in the chosen colour.
    expect(k.ink.strokeStyle).toBe("rgba(18,214,74,0.35)");
  });

  it("shows a crosshair cursor everywhere in laser mode", () => {
    const cur = selectController.hoverCursor!(
      pointer(500, 500, { type: "pointermove" }),
      ctx,
    );
    expect(cur).toBe("crosshair");
  });

  it("toggleLaserMode flips the flag off again", () => {
    st().toggleLaserMode();
    expect(st().laserMode).toBe(false);
  });
});

describe("a received laser focus drives the receiver's camera", () => {
  beforeEach(() => {
    freshBoard();
    st().setCamera({ x: 0, y: 0, scale: 1 });
    mountStage(800, 600);
  });
  afterEach(() => document.getElementById("stage")?.remove());

  it("leaves the camera alone when the point is already visible", () => {
    expect(isWorldPointVisible({ x: 400, y: 300 }, 48)).toBe(true);
    const before = { ...st().camera };
    applyLaserFocus({ seq: 1, kind: "point", x: 400, y: 300 });
    expect(st().camera).toEqual(before);
  });

  it("recentres an off-screen point into the middle of the view", () => {
    applyLaserFocus({ seq: 1, kind: "point", x: 5000, y: 5000 });
    const cam = st().camera;
    expect(cam.x + 5000 * cam.scale).toBeCloseTo(400); // → viewport centre x
    expect(cam.y + 5000 * cam.scale).toBeCloseTo(300); // → viewport centre y
    expect(cam.scale).toBe(1); // a point keeps the current zoom
  });

  it("zooms to fit a framed area and centres on it", () => {
    applyLaserFocus({ seq: 1, kind: "rect", x: 0, y: 0, w: 400, h: 300 });
    const cam = st().camera;
    expect(cam.x + 200 * cam.scale).toBeCloseTo(400); // rect centre → view centre
    expect(cam.y + 150 * cam.scale).toBeCloseTo(300);
    expect(cam.scale).toBeCloseTo(1.76, 2); // min(800/400,600/300)*(1-0.12)
  });
});
