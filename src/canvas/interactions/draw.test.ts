// The draw controller: freehand delegates to the brush (a stroke lands in the
// document), the shape modes drag-create shape objects with grid snapping,
// Shift constraints and the select-tool handover.

import { beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import { drawController } from "@/canvas/interactions/draw";
import { useBoardStore } from "@/board/store";
import { fakeInputCtx, freshBoard, pointer } from "@/testing/fixtures";
import type { ShapeObject } from "@/tools/shape";

const st = () => useBoardStore.getState();
const ctx = fakeInputCtx();

const down = (x: number, y: number, o?: Parameters<typeof pointer>[2]) =>
  drawController.onPointerDown(pointer(x, y, o), ctx);
const move = (x: number, y: number, o?: Parameters<typeof pointer>[2]) =>
  drawController.onPointerMove(
    pointer(x, y, { type: "pointermove", ...o }),
    ctx,
  );
const up = (x: number, y: number, o?: Parameters<typeof pointer>[2]) =>
  drawController.onPointerUp(pointer(x, y, { type: "pointerup", ...o }), ctx);

const lastShape = (): ShapeObject =>
  st().board.objects[st().board.objects.length - 1] as unknown as ShapeObject;

beforeEach(() => {
  freshBoard();
});

describe("freehand mode (unchanged pen behaviour)", () => {
  it("a drag commits a pen stroke", () => {
    down(10, 10);
    move(60, 40);
    up(60, 40);
    expect(st().board.strokes).toHaveLength(1);
    expect(st().board.objects).toHaveLength(0);
    expect(st().tool).toBe("pen"); // freehand keeps drawing
  });
});

describe("shape modes (roadmap A2)", () => {
  it("drags a rectangle onto the grid, selects it and hands over to select", () => {
    st().setDrawMode("rect");
    down(33, 34); // snaps to (30, 30)
    move(148, 93); // snaps to (150, 90)
    up(148, 93);

    const o = lastShape();
    expect(o.type).toBe("shape");
    expect(o).toMatchObject({ kind: "rect", x: 30, y: 30, w: 120, h: 60 });
    expect(o.stroke).toBe(st().color);
    expect(o.fill).toBe("none");
    expect(st().selection.objectIds).toEqual([o.id]);
    expect(st().tool).toBe("select");
  });

  it("Alt bypasses the grid; snapping is off on non-squared paper anyway", () => {
    st().setDrawMode("rect");
    down(33, 34, { altKey: true });
    move(93, 74, { altKey: true });
    up(93, 74, { altKey: true });
    expect(lastShape()).toMatchObject({ x: 33, y: 34, w: 60, h: 40 });
  });

  it("Shift constrains a line to 15° steps", () => {
    st().setDrawMode("line");
    down(0, 0, { altKey: true });
    move(100, 4, { shiftKey: true });
    up(100, 4, { shiftKey: true });
    const o = lastShape();
    expect(o.kind).toBe("line");
    // Snapped horizontal: both endpoints share a y (box floored at 1 high).
    expect(o.pts[0].y).toBeCloseTo(o.pts[1].y, 5);
  });

  it("a triangle arrives with angle measures on by default", () => {
    st().setDrawMode("triangle");
    down(0, 0);
    move(120, 90);
    up(120, 90);
    const o = lastShape();
    expect(o.kind).toBe("triangle");
    expect(o.showAngles).toBe(true);
    expect(o.pts).toHaveLength(3);
  });

  it("polygon mode uses the store's side count", () => {
    st().setDrawMode("polygon");
    st().setPolygonSides(6);
    down(0, 0);
    move(120, 120);
    up(120, 120);
    expect(lastShape().pts).toHaveLength(6);
  });

  it("closed shapes take the current fill colour", () => {
    st().setFillColor("#F7E7B8");
    st().setDrawMode("ellipse");
    down(0, 0);
    move(90, 60);
    up(90, 60);
    expect(lastShape().fill).toBe("#F7E7B8");
  });

  it("an angle drag opens like a protractor and shows its measure", () => {
    st().setDrawMode("angle");
    down(300, 300, { altKey: true });
    move(240, 240, { altKey: true }); // up-left: 135°
    up(240, 240, { altKey: true });
    const o = lastShape();
    expect(o.kind).toBe("angle");
    expect(o.pts).toHaveLength(3);
    expect(o.showAngles).toBe(true);
  });

  it("a sub-6px drag is a stray tap: nothing is created", () => {
    st().setDrawMode("rect");
    down(50, 50, { altKey: true });
    move(52, 52, { altKey: true });
    up(52, 52, { altKey: true });
    expect(st().board.objects).toHaveLength(0);
    expect(st().tool).toBe("pen"); // no handover without a shape
  });

  it("a second-finger cancel abandons the preview without committing", () => {
    st().setDrawMode("rect");
    down(30, 30);
    move(120, 90);
    drawController.cancel!(ctx);
    up(120, 90);
    expect(st().board.objects).toHaveLength(0);
  });
});
