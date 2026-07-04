// The board-command service: placement, param editing (the scale-preservation
// invariant), and the internal clipboard. Placement geometry is asserted
// against a fixed 800x600 stage injected through the provider seam.
//
// Fake timers freeze Date.now (the z-order key); tests advance a few ms
// between inserts so stacking order is deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/tools";
import {
  copySelection,
  duplicateSelection,
  editObject,
  pasteClipboard,
  placeObject,
  resetClipboard,
  setStageSizeProvider,
} from "@/board/commands";
import { useBoardStore } from "@/board/store";
import { aStroke, anObject, freshBoard } from "@/testing/fixtures";

const st = () => useBoardStore.getState();

// Numberline defaults: natural size w 540 (10 intervals * 54), h 64.
const NL = { start: 0, step: 1, intervals: 10, hide: false };

beforeEach(() => {
  vi.useFakeTimers();
  freshBoard();
  setStageSizeProvider(() => ({ w: 800, h: 600 }));
  resetClipboard();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("placeObject", () => {
  it("centres the object on the stage, selects it, and switches to the select tool", () => {
    placeObject("numberline", NL);

    const [obj] = st().board.objects;
    expect(obj).toMatchObject({ x: 800 / 2 - 540 / 2, y: 600 / 2 - 64 / 2 });
    expect(st().selection.objectIds).toEqual([obj.id]);
    expect(st().tool).toBe("select");
  });

  it("cascades successive placements by 22px so they never stack", () => {
    placeObject("numberline", NL);
    const first = st().board.objects.find(
      (o) => o.id === st().selection.objectIds[0],
    )!;
    vi.advanceTimersByTime(2);
    placeObject("numberline", NL);
    const second = st().board.objects.find(
      (o) => o.id === st().selection.objectIds[0],
    )!;

    expect(second.x).toBe(first.x + 22);
    expect(second.y).toBe(first.y + 22);
    // The newer object draws on top.
    expect(st().board.objects.map((o) => o.id)).toEqual([first.id, second.id]);
  });

  it("a drop point overrides the centre and skips the cascade", () => {
    placeObject("numberline", NL); // occupy the board so a cascade WOULD apply
    vi.advanceTimersByTime(2);
    placeObject("numberline", NL, { at: { x: 100, y: 100 } });

    const dropped = st().board.objects.find(
      (o) => o.id === st().selection.objectIds[0],
    )!;
    expect(dropped.x).toBe(100 - 540 / 2);
    expect(dropped.y).toBe(100 - 64 / 2);
  });

  it("is a no-op for an unregistered tool type", () => {
    placeObject("no-such-tool", {});
    expect(st().board.objects).toHaveLength(0);
    expect(st().tool).toBe("pen"); // untouched
  });
});

describe("editObject", () => {
  it("re-derives the box from the new params at the SAME resize scale", () => {
    placeObject("numberline", NL);
    const id = st().selection.objectIds[0];
    const placed = st().board.objects[0];

    // The user resized the widget to 2x...
    st().resizeObject(id, { x: placed.x, y: placed.y, w: 1080, h: 128 });
    // ...then edited its params (5 intervals: natural size 270x64).
    editObject(id, { ...NL, intervals: 5 });

    const obj = st().board.objects[0];
    expect(obj.intervals).toBe(5);
    expect(obj.w).toBe(270 * 2); // still 2x, NOT snapped back to 1x
    expect(obj.h).toBe(64 * 2);
    expect(obj.x).toBe(placed.x); // position untouched
    expect(obj.y).toBe(placed.y);
  });

  it("is a no-op for an unknown object id", () => {
    placeObject("numberline", NL);
    const before = st().board.objects[0];
    editObject("missing", { ...NL, intervals: 5 });
    expect(st().board.objects[0]).toBe(before);
  });
});

describe("internal clipboard", () => {
  const seedAndSelectAll = () => {
    freshBoard({ objects: [anObject()], strokes: [aStroke()] });
    st().selectAll();
  };

  it("copy + paste inserts clones with fresh ids at a 24px offset, selected and ready to move", () => {
    seedAndSelectAll();
    const srcObj = st().board.objects[0];
    const srcStroke = st().board.strokes[0];

    copySelection();
    vi.advanceTimersByTime(2);
    pasteClipboard();

    expect(st().board.objects).toHaveLength(2);
    expect(st().board.strokes).toHaveLength(2);
    const cloneObj = st().board.objects.find((o) => o.id !== srcObj.id)!;
    const cloneStroke = st().board.strokes.find((s) => s.id !== srcStroke.id)!;
    expect(cloneObj.x).toBe(srcObj.x + 24);
    expect(cloneObj.y).toBe(srcObj.y + 24);
    expect(cloneStroke.points[0]).toEqual({
      x: srcStroke.points[0].x + 24,
      y: srcStroke.points[0].y + 24,
    });
    expect(st().selection).toEqual({
      objectIds: [cloneObj.id],
      strokeIds: [cloneStroke.id],
    });
    expect(st().tool).toBe("select");
  });

  it("repeated pastes cascade further instead of stacking", () => {
    seedAndSelectAll();
    const srcX = st().board.objects[0].x;

    copySelection();
    vi.advanceTimersByTime(2);
    pasteClipboard();
    vi.advanceTimersByTime(2);
    pasteClipboard();

    const xs = st()
      .board.objects.map((o) => o.x)
      .sort((a, b) => a - b);
    expect(xs).toEqual([srcX, srcX + 24, srcX + 48]);
  });

  it("re-copying resets the paste cascade", () => {
    seedAndSelectAll();
    copySelection();
    vi.advanceTimersByTime(2);
    pasteClipboard();
    vi.advanceTimersByTime(2);
    pasteClipboard();

    // Copy the ORIGINAL again: the next paste lands at +24, not +72.
    st().setSelection({
      objectIds: [st().board.objects[0].id],
      strokeIds: [],
    });
    copySelection();
    vi.advanceTimersByTime(2);
    pasteClipboard();

    const src = st().board.objects[0];
    const pastedAt24 = st().board.objects.filter((o) => o.x === src.x + 24);
    expect(pastedAt24).toHaveLength(2); // the first paste + the fresh one
  });

  it("pasting still works after the source was deleted (cut & paste)", () => {
    seedAndSelectAll();
    copySelection();
    st().deleteSelection();
    expect(st().board.objects).toHaveLength(0);

    vi.advanceTimersByTime(2);
    pasteClipboard();
    expect(st().board.objects).toHaveLength(1);
    expect(st().board.strokes).toHaveLength(1);
  });

  it("duplicate clones the selection as ONE undo step", () => {
    seedAndSelectAll();
    vi.advanceTimersByTime(2);
    duplicateSelection();

    expect(st().board.objects).toHaveLength(2);
    expect(st().board.strokes).toHaveLength(2);

    st().undo();
    expect(st().board.objects).toHaveLength(1);
    expect(st().board.strokes).toHaveLength(1);
  });

  it("clones land on top of the z-order even when their source was underneath", () => {
    const bottom = anObject({ x: 0, y: 0 });
    const top = anObject({ x: 50, y: 50 });
    freshBoard({ objects: [bottom, top] }); // seeded draw order: bottom, top

    st().setSelection({ objectIds: [bottom.id], strokeIds: [] });
    vi.advanceTimersByTime(2);
    duplicateSelection();

    const ids = st().board.objects.map((o) => o.id);
    expect(ids[2]).toBe(st().selection.objectIds[0]); // the clone drew last
  });
});
