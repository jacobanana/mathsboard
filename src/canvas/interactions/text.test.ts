// The text controller's two gestures: a TAP makes auto-sizing text at a point;
// a CLICK-DRAG makes a fixed-width text box that wraps to the dragged width.
// New text inherits the store's default alignment. (The <textarea> open() is a
// no-op stub here — we assert on the committed document.)

import { beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import { textController } from "@/canvas/interactions/text";
import { useBoardStore } from "@/board/store";
import { fakeInputCtx, freshBoard, pointer } from "@/testing/fixtures";

const st = () => useBoardStore.getState();
const ctx = fakeInputCtx();

const down = (x: number, y: number, o?: Parameters<typeof pointer>[2]) =>
  textController.onPointerDown(pointer(x, y, o), ctx);
const move = (x: number, y: number, o?: Parameters<typeof pointer>[2]) =>
  textController.onPointerMove(pointer(x, y, { type: "pointermove", ...o }), ctx);
const up = (x: number, y: number, o?: Parameters<typeof pointer>[2]) =>
  textController.onPointerUp(pointer(x, y, { type: "pointerup", ...o }), ctx);

const only = () => st().board.objects[0];

beforeEach(() => {
  freshBoard();
  st().setTool("text");
});

describe("tap = auto-sizing text (unchanged)", () => {
  it("a click with no drag creates auto text (no boxW) at the point", () => {
    down(50, 60);
    up(50, 60);
    const o = only();
    expect(o.type).toBe("text");
    expect(o).toMatchObject({ x: 50, y: 60, text: "" });
    expect(o.boxW).toBeUndefined();
    expect(st().selection.objectIds).toEqual([o.id]);
  });

  it("a jitter below the drag threshold is still a tap", () => {
    down(50, 60);
    move(53, 62); // ~3.6px < 8px threshold
    up(53, 62);
    expect(only().boxW).toBeUndefined();
    expect(only()).toMatchObject({ x: 50, y: 60 }); // anchored at the press
  });
});

describe("click-drag = a fixed-width text box", () => {
  it("drags a box whose boxW is the dragged width, anchored at its top-left", () => {
    down(10, 20);
    move(210, 90); // well past threshold
    up(210, 90);
    const o = only();
    expect(o).toMatchObject({ x: 10, y: 20, boxW: 200 });
    expect(o.w).toBe(200); // natural width == the wrap width
  });

  it("anchors at the top-left regardless of drag direction", () => {
    down(210, 90);
    move(10, 20); // dragged up-and-left
    up(10, 20);
    expect(only()).toMatchObject({ x: 10, y: 20, boxW: 200 });
  });

  it("clamps a near-vertical drag up to the minimum box width", () => {
    down(50, 20);
    move(52, 200); // tall but ~0 wide
    up(52, 200);
    expect(only().boxW).toBe(48); // MIN_BOX_W, not 2
  });
});

describe("alignment default", () => {
  it("new text inherits the store's default alignment", () => {
    st().setTextAlign("center");
    down(50, 60);
    up(50, 60);
    expect(only().align).toBe("center");
  });
});
