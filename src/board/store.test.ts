// Document edits + undo semantics, exercised through the store's public
// actions against a REAL solo session (local Y.Doc + Y.UndoManager). These are
// the behaviours with the highest regression cost: what lands in the
// document, what one "undo step" covers, and what undo must never touch.

import { beforeEach, describe, expect, it } from "vitest";
import { useBoardStore } from "@/board/store";
import { aStroke, anObject, freshBoard } from "@/testing/fixtures";

const st = () => useBoardStore.getState();

beforeEach(() => {
  freshBoard();
});

describe("drawing and erasing", () => {
  it("adds a drawn stroke to the document", () => {
    const s = aStroke();
    st().addStroke(s);
    expect(st().board.strokes).toHaveLength(1);
    expect(st().board.strokes[0].points).toEqual(s.points);
  });

  it("erasing the middle of a stroke splits it, the first fragment keeping the id", () => {
    const s = aStroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    st().addStroke(s);
    // A vertical eraser pass crossing the line at x=50, radius 10.
    st().eraseStrokes({
      points: [{ x: 50, y: -20 }, { x: 50, y: 20 }],
      size: 20,
    });

    const strokes = st().board.strokes;
    expect(strokes).toHaveLength(2);
    const left = strokes.find((x) => x.id === s.id)!;
    const right = strokes.find((x) => x.id !== s.id)!;
    expect(left).toBeDefined();
    expect(Math.max(...left.points.map((p) => p.x))).toBeLessThan(50);
    expect(Math.min(...right.points.map((p) => p.x))).toBeGreaterThan(50);
  });

  it("deletes a stroke the eraser fully covers", () => {
    st().addStroke(aStroke());
    st().eraseStrokes({ points: [{ x: 50, y: 0 }], size: 300 });
    expect(st().board.strokes).toHaveLength(0);
  });

  it("an eraser pass over blank space is a complete no-op — no empty undo step", () => {
    st().addStroke(aStroke());
    st().eraseStrokes({ points: [{ x: 500, y: 500 }], size: 10 });

    expect(st().board.strokes).toHaveLength(1);
    // One undo must reach the stroke itself, not an empty eraser step.
    st().undo();
    expect(st().board.strokes).toHaveLength(0);
    expect(st().canUndo).toBe(false);
  });

  it("a partially erased selected stroke stays selected via its surviving fragment", () => {
    const s = aStroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    st().addStroke(s);
    st().setSelection({ objectIds: [], strokeIds: [s.id] });

    st().eraseStrokes({
      points: [{ x: 50, y: -20 }, { x: 50, y: 20 }],
      size: 20,
    });

    // The split-away fragment is NOT silently added to the selection.
    expect(st().selection.strokeIds).toEqual([s.id]);
  });
});

describe("undo semantics", () => {
  it("tracks the undo/redo stacks in canUndo/canRedo", () => {
    expect(st().canUndo).toBe(false);
    expect(st().canRedo).toBe(false);

    st().addStroke(aStroke());
    expect(st().canUndo).toBe(true);

    st().undo();
    expect(st().canUndo).toBe(false);
    expect(st().canRedo).toBe(true);

    st().redo();
    expect(st().board.strokes).toHaveLength(1);
    expect(st().canUndo).toBe(true);
    expect(st().canRedo).toBe(false);
  });

  it("a whole drag (pushHistory + many moves) undoes as ONE step", () => {
    const o = anObject();
    st().addObject(o);

    st().pushHistory(); // the drag handler's single boundary at drag start
    st().moveObject(o.id, 10, 5);
    st().moveObject(o.id, 20, 10);
    st().moveObject(o.id, 30, 15);

    st().undo(); // reverts the whole drag...
    const obj = st().board.objects[0];
    expect(obj.x).toBe(0);
    expect(obj.y).toBe(0);

    st().undo(); // ...and only then the insertion
    expect(st().board.objects).toHaveLength(0);
  });

  it("each updateObject is its own undo step", () => {
    const o = anObject();
    st().addObject(o);
    st().updateObject(o.id, { start: 5 });

    st().undo();
    expect(st().board.objects[0].start).toBe(0);
    expect(st().board.objects).toHaveLength(1);
  });

  it("widget-state edits persist in the document but never undo, and never cut a step", () => {
    const o = anObject();
    st().addObject(o);

    st().pushHistory();
    st().moveObject(o.id, 10, 10);
    st().updateWidgetState(o.id, { "ans:q1": "7" }); // typed mid-drag
    st().moveObject(o.id, 20, 20);

    expect(st().board.objects[0]["ans:q1"]).toBe("7");

    // One undo reverts BOTH moves (the widget edit did not split the step)
    // and leaves the typed answer untouched.
    st().undo();
    const obj = st().board.objects[0];
    expect(obj.x).toBe(0);
    expect(obj.y).toBe(0);
    expect(obj["ans:q1"]).toBe("7");
  });

  it("undefined values in a widget-state patch delete their fields", () => {
    const o = anObject();
    st().addObject(o);
    st().updateWidgetState(o.id, { "ans:q1": "7" });
    st().updateWidgetState(o.id, { "ans:q1": undefined });
    expect("ans:q1" in st().board.objects[0]).toBe(false);
  });

  it("a batch insert (paste/duplicate) undoes as one step", () => {
    st().addObject(anObject());
    st().addShapes([anObject()], [aStroke()]);

    st().undo();
    expect(st().board.objects).toHaveLength(1);
    expect(st().board.strokes).toHaveLength(0);
  });

  it("an empty batch insert creates no undo step", () => {
    st().addShapes([], []);
    expect(st().canUndo).toBe(false);
  });
});

describe("selection behaviours", () => {
  it("selectAll picks every object and pen stroke but never eraser strokes", () => {
    freshBoard({
      objects: [anObject()],
      strokes: [aStroke(), aStroke({ mode: "eraser" })],
    });

    st().selectAll();
    expect(st().selection.objectIds).toHaveLength(1);
    expect(st().selection.strokeIds).toHaveLength(1);
  });

  it("deleting a shape prunes it from the selection", () => {
    const o = anObject();
    st().addObject(o);
    st().select(o.id);
    st().removeObject(o.id);
    expect(st().selection.objectIds).toEqual([]);
  });

  it("deleteSelection removes everything selected in one undo step and clears the selection", () => {
    freshBoard({ objects: [anObject()], strokes: [aStroke()] });
    st().selectAll();

    st().deleteSelection();
    expect(st().board.objects).toHaveLength(0);
    expect(st().board.strokes).toHaveLength(0);
    expect(st().selection).toEqual({ objectIds: [], strokeIds: [] });

    st().undo();
    expect(st().board.objects).toHaveLength(1);
    expect(st().board.strokes).toHaveLength(1);
  });

  it("nudgeSelection translates objects and stroke points together", () => {
    const o = anObject();
    const s = aStroke();
    freshBoard({ objects: [o], strokes: [s] });
    st().selectAll();

    st().pushHistory();
    st().nudgeSelection(5, 7);

    expect(st().board.objects[0].x).toBe(5);
    expect(st().board.objects[0].y).toBe(7);
    expect(st().board.strokes[0].points[0]).toEqual({ x: 5, y: 7 });
    expect(st().board.strokes[0].points[1]).toEqual({ x: 105, y: 7 });
  });
});

describe("draft dirtiness", () => {
  it("a local edit marks the draft dirty; seeding never does", () => {
    expect(st().dirty).toBe(false); // freshBoard seeds via SEED_ORIGIN
    st().addStroke(aStroke());
    expect(st().dirty).toBe(true);
  });
});
