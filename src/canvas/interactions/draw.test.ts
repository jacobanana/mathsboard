// The draw controller: freehand delegates to the brush (a stroke lands in the
// document), the shape modes drag-create shape objects with grid snapping
// (Shift flips it per gesture), magnetic line directions, the aspect lock and
// the point-by-point polygon — and the draw tool STAYS active afterwards.

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
  it("drags a rectangle onto the grid and keeps the draw tool active", () => {
    st().setDrawMode("rect");
    down(33, 34); // snaps to (30, 30)
    move(148, 93); // snaps to (150, 90)
    up(148, 93);

    const o = lastShape();
    expect(o.type).toBe("shape");
    expect(o).toMatchObject({ kind: "rect", x: 30, y: 30, w: 120, h: 60 });
    expect(o.stroke).toBe(st().color);
    expect(o.fill).toBe("none");
    // The draw tool stays put so the next shape can be drawn immediately.
    expect(st().tool).toBe("pen");
    expect(st().drawMode).toBe("rect");
  });

  it("holding Shift flips grid snapping off for the gesture", () => {
    st().setDrawMode("rect");
    down(33, 34, { shiftKey: true });
    move(93, 74, { shiftKey: true });
    up(93, 74, { shiftKey: true });
    expect(lastShape()).toMatchObject({ x: 33, y: 34, w: 60, h: 40 });
  });

  it("holding Shift flips grid snapping ON when the toggle is off", () => {
    st().setSnap(false);
    st().setDrawMode("rect");
    down(33, 34, { shiftKey: true });
    move(148, 93, { shiftKey: true });
    up(148, 93, { shiftKey: true });
    expect(lastShape()).toMatchObject({ x: 30, y: 30, w: 120, h: 60 });
  });

  it("the aspect lock draws squares / circles", () => {
    st().setAspectLock(true);
    st().setDrawMode("ellipse");
    down(0, 0, { altKey: true });
    move(120, 60, { altKey: true });
    up(120, 60, { altKey: true });
    const o = lastShape();
    expect(o.kind).toBe("ellipse");
    expect(o.w).toBe(o.h); // circle
  });

  it("Alt bypasses the grid; snapping is off on non-squared paper anyway", () => {
    st().setDrawMode("rect");
    down(33, 34, { altKey: true });
    move(93, 74, { altKey: true });
    up(93, 74, { altKey: true });
    expect(lastShape()).toMatchObject({ x: 33, y: 34, w: 60, h: 40 });
  });

  it("near-15° line drags magnetise onto the exact direction", () => {
    st().setDrawMode("line");
    down(0, 0, { altKey: true });
    move(100, 4); // ~2.3° off horizontal: inside the magnet
    up(100, 4);
    const o = lastShape();
    expect(o.kind).toBe("line");
    // Snapped horizontal: both endpoints share a y (box floored at 1 high).
    expect(o.pts[0].y).toBeCloseTo(o.pts[1].y, 5);
  });

  it("Alt keeps a line drag free of the direction magnet", () => {
    st().setSnap(false);
    st().setDrawMode("line");
    down(0, 0, { altKey: true });
    move(100, 4, { altKey: true });
    up(100, 4, { altKey: true });
    const o = lastShape();
    expect(o.nh).toBeCloseTo(4, 5); // kept its slight slope
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

describe("point-by-point polygon (freepoly)", () => {
  const click = (x: number, y: number) => {
    down(x, y, { altKey: true });
    up(x, y, { altKey: true });
  };

  beforeEach(() => {
    st().setDrawMode("freepoly");
  });

  it("clicks drop corners; clicking the first corner closes the polygon", () => {
    click(0, 0);
    click(120, 0);
    click(120, 90);
    click(0, 90);
    expect(st().board.objects).toHaveLength(0); // still building
    click(2, 2); // within the close radius of the first corner
    const o = lastShape();
    expect(o.type).toBe("shape");
    expect(o.kind).toBe("polygon");
    expect(o.pts).toHaveLength(4);
    expect(o.showAngles).toBe(true);
    expect(st().tool).toBe("pen"); // keeps drawing
  });

  it("needs at least three corners to close", () => {
    click(0, 0);
    click(100, 0);
    drawController.onDoubleClick!(pointer(100, 0) as unknown as MouseEvent, ctx);
    expect(st().board.objects).toHaveLength(0);
  });

  it("double-click finishes; the duplicated final click is dropped", () => {
    click(0, 0);
    click(100, 0);
    click(100, 80);
    click(100, 80); // the double-click's second click lands on the same spot
    drawController.onDoubleClick!(
      pointer(100, 80) as unknown as MouseEvent,
      ctx,
    );
    const o = lastShape();
    expect(o.kind).toBe("polygon");
    expect(o.pts).toHaveLength(3);
  });

  it("corners snap to the grid when snapping is on", () => {
    down(3, 4);
    up(3, 4);
    down(63, 33);
    up(63, 33);
    down(33, 63);
    up(33, 63);
    drawController.onDoubleClick!(
      pointer(33, 63) as unknown as MouseEvent,
      ctx,
    );
    const o = lastShape();
    expect(o).toMatchObject({ x: 0, y: 0 });
    expect(o.pts).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 30 },
      { x: 30, y: 60 },
    ]);
  });
});
