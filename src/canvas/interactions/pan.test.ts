// The pan controller, driven through real press/move/release sequences.
//
// Panning itself is one line of arithmetic; what needs pinning is the TAP:
// a double-click in this tool edits the object under the pointer and leaves it
// selected, and the pan tool is otherwise the one place a selection frame
// could never be dismissed without a trip to the dock.

import { beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import { panController } from "@/canvas/interactions/pan";
import { useBoardStore } from "@/board/store";
import type { AnyBoardObject } from "@/board/types";
import { anObject, fakeInputCtx, freshBoard, pointer } from "@/testing/fixtures";

const st = () => useBoardStore.getState();
const ctx = fakeInputCtx();

const down = (x: number, y: number) =>
  panController.onPointerDown(pointer(x, y), ctx);
const move = (x: number, y: number) =>
  panController.onPointerMove(pointer(x, y, { type: "pointermove" }), ctx);
const up = (x: number, y: number) =>
  panController.onPointerUp(pointer(x, y, { type: "pointerup" }), ctx);

let O: AnyBoardObject;

beforeEach(() => {
  O = anObject({ x: 100, y: 100 });
  freshBoard({ objects: [O] });
  st().setTool("pan");
});

describe("the pan tool", () => {
  it("drags the camera by the pointer delta", () => {
    down(200, 200);
    move(260, 230);
    up(260, 230);
    expect(st().camera.x).toBe(60);
    expect(st().camera.y).toBe(30);
  });

  it("clears the selection on a tap", () => {
    st().select(O.id);
    down(400, 400);
    up(400, 400);
    expect(st().selection.objectIds).toEqual([]);
  });

  it("keeps the selection when the press was a real pan", () => {
    st().select(O.id);
    down(400, 400);
    move(500, 400);
    up(500, 400);
    expect(st().selection.objectIds).toEqual([O.id]);
  });

  it("ignores the jitter of a shaky tap", () => {
    st().select(O.id);
    down(400, 400);
    move(402, 401); // inside the tap slop — still a tap
    up(402, 401);
    expect(st().selection.objectIds).toEqual([]);
  });

  it("leaves an empty selection alone", () => {
    const before = st().selection;
    down(400, 400);
    up(400, 400);
    expect(st().selection).toBe(before); // no store write at all
  });
});
