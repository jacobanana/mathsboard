// Stroke rendering config: the pen / highlighter / eraser branches of
// strokeStyleFor + drawStrokeFull. The visual difference between a pen and a
// highlighter is entirely the canvas STATE at stroke() time (translucent,
// source-over), so we drive a recording 2D-context stub and assert that state.

import { describe, expect, it } from "vitest";
import { drawStrokeFull, HIGHLIGHTER_ALPHA } from "@/canvas/drawHelpers";

/** A minimal CanvasRenderingContext2D stub that snapshots its own drawing state
 *  every time a paint call (stroke/fill) runs, so tests can inspect the alpha /
 *  composite / colour in effect at that instant. */
function recordingCtx() {
  const snaps: { globalAlpha: number; op: string; strokeStyle: string }[] = [];
  const ctx = {
    lineCap: "butt",
    lineJoin: "miter",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    strokeStyle: "#000",
    fillStyle: "#000",
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    snap() {
      snaps.push({
        globalAlpha: this.globalAlpha,
        op: String(this.globalCompositeOperation),
        strokeStyle: String(this.strokeStyle),
      });
    },
    stroke() {
      this.snap();
    },
    fill() {
      this.snap();
    },
  };
  return { ctx, snaps };
}

const line = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 20, y: 0 },
];

describe("drawStrokeFull rendering config", () => {
  it("draws a pen stroke opaque, source-over, in its colour", () => {
    const { ctx, snaps } = recordingCtx();
    drawStrokeFull(ctx as never, { mode: "pen", color: "#123456", size: 6, points: line });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ globalAlpha: 1, op: "source-over", strokeStyle: "#123456" });
  });

  it("draws a highlighter stroke translucent, source-over, in its colour", () => {
    const { ctx, snaps } = recordingCtx();
    drawStrokeFull(ctx as never, { mode: "highlighter", color: "#ffdd00", size: 20, points: line });
    expect(snaps[0]).toMatchObject({
      globalAlpha: HIGHLIGHTER_ALPHA,
      op: "source-over",
      strokeStyle: "#ffdd00",
    });
    expect(HIGHLIGHTER_ALPHA).toBeGreaterThan(0);
    expect(HIGHLIGHTER_ALPHA).toBeLessThan(1);
  });

  it("draws an eraser stroke as a destination-out cut", () => {
    const { ctx, snaps } = recordingCtx();
    drawStrokeFull(ctx as never, { mode: "eraser", color: "#123456", size: 40, points: line });
    expect(snaps[0].op).toBe("destination-out");
  });

  it("resets alpha + composite afterwards so a highlighter never bleeds onto the next stroke", () => {
    const { ctx } = recordingCtx();
    drawStrokeFull(ctx as never, { mode: "highlighter", color: "#ffdd00", size: 20, points: line });
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });
});
