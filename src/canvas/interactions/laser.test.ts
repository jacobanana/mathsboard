// The laser interaction controller: a press-drag "look here" comet. It must
// write NOTHING to the document (no stroke, no object, no undo — so it can't
// corrupt the CRDT), render a trail while pressed, and clear on release.
// Rendering is asserted through a spy OverlayKit because jsdom has no real 2D
// canvas (see testing/vitestSetup.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/tools";
import { laserController } from "@/canvas/interactions/laser";
import { useBoardStore } from "@/board/store";
import { fakeInputCtx, freshBoard, pointer } from "@/testing/fixtures";
import type { OverlayKit } from "@/canvas/interactions/types";
import { theme } from "@/styles/theme";

// jsdom (vitest) has no requestAnimationFrame; the controller schedules its
// awareness publish on it. Solo mode makes that publish a no-op, so a stub that
// never fires is enough to exercise the pointer + overlay logic.
globalThis.requestAnimationFrame ??= (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= (() => {}) as typeof cancelAnimationFrame;

const st = () => useBoardStore.getState();
const ctx = fakeInputCtx();

const down = (x: number, y: number) =>
  laserController.onPointerDown(pointer(x, y), ctx);
const move = (x: number, y: number) =>
  laserController.onPointerMove(pointer(x, y, { type: "pointermove" }), ctx);
const up = (x: number, y: number) =>
  laserController.onPointerUp(pointer(x, y, { type: "pointerup" }), ctx);

/** A spy ink context recording the draw calls drawOverlay makes. */
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
  };
  const kit: OverlayKit = {
    back: {} as CanvasRenderingContext2D,
    ink: ink as unknown as CanvasRenderingContext2D,
    camera: { x: 0, y: 0, scale: 1 },
    theme,
  };
  return { kit, ink };
}

beforeEach(() => {
  freshBoard(); // identity camera: pointer coords ARE world coords
  st().setTool("laser");
});

// Never leak a live trail (module singleton) into the next test.
afterEach(() => laserController.cancel?.(ctx));

describe("laser controller", () => {
  it("draws nothing before the first press", () => {
    const { kit, ink } = spyKit();
    laserController.drawOverlay!(kit, ctx);
    expect(ink.arc).not.toHaveBeenCalled();
    expect(ink.stroke).not.toHaveBeenCalled();
  });

  it("press then move renders a comet: a tail stroke and a head dot", () => {
    down(100, 100);
    move(140, 120);
    const { kit, ink } = spyKit();
    laserController.drawOverlay!(kit, ctx);
    expect(ink.stroke).toHaveBeenCalled(); // the tail polyline
    expect(ink.arc).toHaveBeenCalled(); // the glowing head
  });

  it("writes nothing to the document and pushes no undo step", () => {
    down(100, 100);
    move(140, 120);
    up(140, 120);
    expect(st().board.strokes).toHaveLength(0);
    expect(st().board.objects).toHaveLength(0);
    expect(st().canUndo).toBe(false);
  });

  it("clears the trail on release", () => {
    down(100, 100);
    move(140, 120);
    up(140, 120);
    const { kit, ink } = spyKit();
    laserController.drawOverlay!(kit, ctx);
    expect(ink.arc).not.toHaveBeenCalled();
    expect(ink.stroke).not.toHaveBeenCalled();
  });

  it("caps the tail to the most recent points", () => {
    down(0, 0);
    for (let i = 1; i <= 20; i++) move(i * 5, 0);
    const { kit, ink } = spyKit();
    laserController.drawOverlay!(kit, ctx);
    // MAX_TRAIL is 8: the tail polyline issues one moveTo + (8 - 1) lineTo,
    // never one per drag point.
    expect(ink.lineTo).toHaveBeenCalledTimes(7);
  });
});
