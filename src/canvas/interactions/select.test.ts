// The select interaction controller, driven through real press/move/release
// sequences against the real store (identity camera: pointer coords ARE world
// coords). Covers the selection rules the UI promises: strokes win over
// objects, shift toggles, plain click on a multi-select collapses on release,
// drags move everything as one undo step, lasso area-select, and handle
// resize with the locked aspect ratio.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import { editObjectAt, selectController } from "@/canvas/interactions/select";
import { useBoardStore } from "@/board/store";
import { id as newId } from "@/board/types";
import type { AnyBoardObject, Stroke } from "@/board/types";
import { anObject, aStroke, fakeInputCtx, freshBoard, pointer } from "@/testing/fixtures";

const st = () => useBoardStore.getState();
const ctx = fakeInputCtx();

const down = (x: number, y: number, o?: { shiftKey?: boolean }) =>
  selectController.onPointerDown(pointer(x, y, o), ctx);
const move = (x: number, y: number) =>
  selectController.onPointerMove(pointer(x, y, { type: "pointermove" }), ctx);
const up = (x: number, y: number) =>
  selectController.onPointerUp(pointer(x, y, { type: "pointerup" }), ctx);

// O spans 100..640 x 100..164; S is a stroke crossing it at y=120.
let O: AnyBoardObject;
let S: Stroke;

beforeEach(() => {
  O = anObject({ x: 100, y: 100 });
  S = aStroke({ points: [{ x: 150, y: 120 }, { x: 250, y: 120 }] });
  freshBoard({ objects: [O], strokes: [S] });
  st().setTool("select");
});

afterEach(() => {
  selectController.cancel?.(ctx); // never leak a live drag into the next test
});

describe("click selection", () => {
  it("clicking an object selects exactly it", () => {
    down(120, 105); // on O, 15px away from S (outside its 9px halo)
    up(120, 105);
    expect(st().selection).toEqual({ objectIds: [O.id], strokeIds: [] });
  });

  it("a stroke sitting above an object wins the click", () => {
    down(200, 120); // on S's line, inside O's box
    up(200, 120);
    expect(st().selection).toEqual({ objectIds: [], strokeIds: [S.id] });
  });

  it("shift-click toggles membership without deselecting the rest", () => {
    down(120, 105);
    up(120, 105); // O selected
    down(200, 120, { shiftKey: true });
    up(200, 120);
    expect(st().selection).toEqual({ objectIds: [O.id], strokeIds: [S.id] });

    down(200, 120, { shiftKey: true }); // shift-click S again -> removed
    up(200, 120);
    expect(st().selection).toEqual({ objectIds: [O.id], strokeIds: [] });
  });

  it("clicking empty space clears the selection", () => {
    st().select(O.id);
    down(700, 50);
    up(700, 50);
    expect(st().selection).toEqual({ objectIds: [], strokeIds: [] });
  });

  it("a plain click on one member of a multi-selection collapses to it on release", () => {
    st().setSelection({ objectIds: [O.id], strokeIds: [S.id] });
    down(120, 105); // on O, no drag
    up(120, 105);
    expect(st().selection).toEqual({ objectIds: [O.id], strokeIds: [] });
  });
});

describe("drag to move", () => {
  it("moves the whole selection as ONE undo step and never collapses it", () => {
    st().setSelection({ objectIds: [O.id], strokeIds: [S.id] });

    down(120, 105);
    move(170, 135); // +50, +30
    move(180, 145); // +10, +10
    up(180, 145);

    expect(st().board.objects[0]).toMatchObject({ x: 160, y: 140 });
    expect(st().board.strokes[0].points[0]).toEqual({ x: 210, y: 160 });
    // Dragging a multi-selection keeps it intact (no click-collapse).
    expect(st().selection).toEqual({ objectIds: [O.id], strokeIds: [S.id] });

    st().undo(); // the entire drag reverts at once
    expect(st().board.objects[0]).toMatchObject({ x: 100, y: 100 });
    expect(st().board.strokes[0].points[0]).toEqual({ x: 150, y: 120 });
  });
});

describe("lasso", () => {
  it("selects every object and pen stroke it touches, never eraser strokes", () => {
    const E = aStroke({
      mode: "eraser",
      points: [{ x: 300, y: 130 }],
    });
    freshBoard({ objects: [O], strokes: [S, E] });
    st().setTool("select");

    down(50, 50); // empty space
    move(700, 300);
    up(700, 300);

    expect(st().selection.objectIds).toEqual([O.id]);
    expect(st().selection.strokeIds).toEqual([S.id]);
  });

  it("shift-lasso adds to the existing selection", () => {
    st().setSelection({ objectIds: [], strokeIds: [S.id] });

    down(90, 80, { shiftKey: true }); // empty space just outside O's halo
    move(700, 110); // a strip overlapping O but none of S's points (y=120)
    up(700, 110);

    expect(st().selection.objectIds).toEqual([O.id]);
    expect(st().selection.strokeIds).toEqual([S.id]); // kept
  });

  it("a near-zero drag on empty space stays a click (no accidental area select)", () => {
    st().select(O.id);
    down(700, 50);
    move(701, 51);
    up(701, 51);
    expect(st().selection).toEqual({ objectIds: [], strokeIds: [] });
  });
});

describe("resize", () => {
  // With O selected, pad 8 puts the SE handle centre at (648, 172).
  it("dragging a corner handle resizes with the aspect ratio locked, as one undo step", () => {
    st().select(O.id);

    down(648, 172);
    move(750, 160);
    up(750, 160);

    const o = st().board.objects[0];
    const ar = 540 / 64;
    expect(o.x).toBe(100); // NW corner anchored
    expect(o.y).toBe(100);
    expect(o.w).toBe(650); // width drove (it moved furthest)
    expect(o.h).toBeCloseTo(650 / ar, 5);

    st().undo();
    expect(st().board.objects[0]).toMatchObject({ w: 540, h: 64 });
  });

  it("hovering a handle of the selected object shows its resize cursor", () => {
    st().select(O.id);
    expect(
      selectController.hoverCursor!(pointer(648, 172), ctx),
    ).toBe("nwse-resize");
    expect(selectController.hoverCursor!(pointer(400, 400), ctx)).toBeNull();
  });
});

describe("double-click edit routing", () => {
  it("routes text objects to the in-place editor and others to the settings dialog", () => {
    const T: AnyBoardObject = {
      id: newId(),
      type: "text",
      x: 400,
      y: 300,
      w: 80,
      h: 34,
      text: "hi",
      size: 26,
      color: "#000",
    };
    freshBoard({ objects: [O, T] });
    const editedInPlace: string[] = [];
    const editedViaDialog: string[] = [];
    const spyCtx = fakeInputCtx({
      editor: {
        open: (obj) => editedInPlace.push(obj.id),
        commit: () => {},
        isOpen: () => false,
      },
      editObject: (obj) => editedViaDialog.push(obj.id),
    });

    editObjectAt(pointer(410, 310), spyCtx); // on the text object
    expect(editedInPlace).toEqual([T.id]);
    expect(st().selection.objectIds).toEqual([T.id]);

    editObjectAt(pointer(120, 105), spyCtx); // on the numberline
    expect(editedViaDialog).toEqual([O.id]);
  });
});
