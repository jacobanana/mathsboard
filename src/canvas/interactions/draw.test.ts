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
    // The draw tool stays put so the next shape can be drawn immediately —
    // but the fresh shape is SELECTED, so its frame shows it's editable.
    expect(st().tool).toBe("pen");
    expect(st().drawMode).toBe("rect");
    expect(st().selection.objectIds).toEqual([o.id]);
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

  it("the polygon goes LIVE at the third corner; clicking the first corner ends", () => {
    click(0, 0);
    click(120, 0);
    expect(st().board.objects).toHaveLength(0); // below the minimum
    click(120, 90);
    // Three corners: the object exists in the document already.
    let o = lastShape();
    expect(o.type).toBe("shape");
    expect(o.kind).toBe("polygon");
    expect(o.pts).toHaveLength(3);
    expect(o.showAngles).toBe(true);
    expect(st().selection.objectIds).toEqual([o.id]);
    click(0, 90); // fourth corner appends to the live object
    o = lastShape();
    expect(o.pts).toHaveLength(4);
    click(2, 2); // within the close radius of the first corner: just ENDS
    expect(st().board.objects).toHaveLength(1);
    expect(lastShape().pts).toHaveLength(4); // the closing click added nothing
    expect(st().tool).toBe("pen"); // keeps drawing
  });

  it("fewer than three corners is discarded on finish", () => {
    click(0, 0);
    click(100, 0);
    drawController.onDoubleClick!(pointer(100, 0) as unknown as MouseEvent, ctx);
    expect(st().board.objects).toHaveLength(0);
  });

  it("the double-click's second click FINISHES instead of adding a point", () => {
    click(0, 0);
    click(100, 0);
    click(100, 80);
    click(100, 80); // same spot, quick: the double-click's second half
    drawController.onDoubleClick!(
      pointer(100, 80) as unknown as MouseEvent,
      ctx,
    );
    expect(st().board.objects).toHaveLength(1);
    const o = lastShape();
    expect(o.kind).toBe("polygon");
    expect(o.pts).toHaveLength(3); // no stray point from finishing
  });

  it("every corner past the third is its OWN undo step", () => {
    click(0, 0);
    click(120, 0);
    click(120, 90);
    click(0, 90);
    click(-30, 45);
    expect(lastShape().pts).toHaveLength(5);
    st().undo();
    expect(lastShape().pts).toHaveLength(4);
    st().undo();
    expect(lastShape().pts).toHaveLength(3);
    st().undo();
    expect(st().board.objects).toHaveLength(0); // creation undone
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

describe("click-to-place curve (CAD style)", () => {
  const click = (x: number, y: number) => {
    down(x, y, { altKey: true });
    up(x, y, { altKey: true });
  };

  beforeEach(() => {
    st().setDrawMode("curve");
  });

  it("the curve goes LIVE at the second click; each further click appends", () => {
    click(0, 100);
    expect(st().board.objects).toHaveLength(0);
    click(80, 20);
    let o = lastShape();
    expect(o.type).toBe("shape");
    expect(o.kind).toBe("curve");
    expect(o.pts).toHaveLength(2);
    expect(o.fill).toBe("none");
    expect(st().selection.objectIds).toEqual([o.id]); // frame shows
    click(160, 100);
    click(240, 20);
    o = lastShape();
    expect(o.pts).toHaveLength(4);
    expect(st().tool).toBe("pen"); // keeps drawing
  });

  it("finishing never adds a point: the double-click's second half just ends", () => {
    click(0, 100);
    click(80, 20);
    click(160, 100);
    click(160, 100); // same spot, quick: finish
    drawController.onDoubleClick!(
      pointer(160, 100) as unknown as MouseEvent,
      ctx,
    );
    expect(st().board.objects).toHaveLength(1);
    expect(lastShape().pts).toHaveLength(3); // NO extra trailing point
  });

  it("each added point is its own undo step, back to nothing", () => {
    click(0, 100);
    click(80, 20);
    click(160, 100);
    click(240, 20);
    expect(lastShape().pts).toHaveLength(4);
    st().undo();
    expect(lastShape().pts).toHaveLength(3);
    st().undo();
    expect(lastShape().pts).toHaveLength(2);
    st().undo();
    expect(st().board.objects).toHaveLength(0);
  });

  it("needs at least two points; a lone click is abandoned", () => {
    click(50, 50);
    drawController.onDoubleClick!(pointer(50, 50) as unknown as MouseEvent, ctx);
    expect(st().board.objects).toHaveLength(0);
  });

  it("clicking near the first point does NOT close it (curves stay open)", () => {
    click(0, 0);
    click(100, 0);
    click(50, 80);
    click(2, 30); // near-ish the first point: just another point, no close
    const o = lastShape();
    expect(o.pts).toHaveLength(4);
  });
});

describe("double-click exits an edit session", () => {
  const dbl = (x: number, y: number) =>
    drawController.onDoubleClick!(pointer(x, y) as unknown as MouseEvent, ctx);

  it("returns to the pointer from an edit session — anywhere on screen", () => {
    st().setDrawMode("rect");
    st().setDrawEditMode(true); // as if entered by double-clicking a rectangle
    dbl(500, 500); // empty space, not over any object
    expect(st().tool).toBe("select");
    expect(st().drawEditMode).toBe(false); // setTool cleared it
  });

  it("does nothing on a plain draw double-click (no edit session)", () => {
    st().setDrawMode("rect");
    dbl(500, 500);
    expect(st().tool).toBe("pen");
  });

  it("a stray stationary tap in an edit session leaves no dot", () => {
    st().setDrawMode("free");
    st().setDrawEditMode(true);
    down(200, 200);
    up(200, 200); // a lone tap would normally drop a 1-point dot stroke
    expect(st().board.strokes).toHaveLength(0);
    // A real freehand drag still commits, edit session or not.
    down(200, 200);
    move(260, 240);
    up(260, 240);
    expect(st().board.strokes).toHaveLength(1);
  });
});
