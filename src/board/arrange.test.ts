// Z-order (bring to front / send to back, roadmap A5) and grouping
// (Ctrl+G / Ctrl+Shift+G) through the command service and the real store —
// assertions observe the mirrored document's draw order and group tags.

import { beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import {
  arrangeSelection,
  duplicateSelection,
  groupSelection,
  rearrange,
  ungroupSelection,
} from "@/board/commands";
import { useBoardStore } from "@/board/store";
import { groupMembers, expandToGroups } from "@/board/selection";
import { anObject, aStroke, freshBoard } from "@/testing/fixtures";
import type { AnyBoardObject } from "@/board/types";

const st = () => useBoardStore.getState();
const objOrder = () => st().board.objects.map((o) => o.id);

let A: AnyBoardObject;
let B: AnyBoardObject;
let C: AnyBoardObject;

beforeEach(() => {
  A = anObject();
  B = anObject();
  C = anObject();
  freshBoard({ objects: [A, B, C] }); // draw order: A (bottom) .. C (top)
  st().setTool("select");
});

describe("rearrange (pure)", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const ids = (arr: { id: string }[]) => arr.map((i) => i.id);

  it("front / back move the selected block, keeping its relative order", () => {
    expect(ids(rearrange(items, new Set(["a", "c"]), "front"))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
    expect(ids(rearrange(items, new Set(["b", "d"]), "back"))).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("forward / backward step past the nearest unselected neighbour", () => {
    expect(ids(rearrange(items, new Set(["a"]), "forward"))).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(ids(rearrange(items, new Set(["d"]), "backward"))).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
    // Already at the boundary: no-op.
    expect(ids(rearrange(items, new Set(["d"]), "forward"))).toEqual(
      ids(items),
    );
    expect(ids(rearrange(items, new Set(["a", "b"]), "backward"))).toEqual(
      ids(items),
    );
  });
});

describe("arrangeSelection", () => {
  it("bring to front re-sorts the mirrored draw order, as one undo step", () => {
    st().select(A.id);
    arrangeSelection("front");
    expect(objOrder()).toEqual([B.id, C.id, A.id]);

    st().undo();
    expect(objOrder()).toEqual([A.id, B.id, C.id]);
  });

  it("send to back / forward / backward", () => {
    st().select(C.id);
    arrangeSelection("back");
    expect(objOrder()).toEqual([C.id, A.id, B.id]);

    arrangeSelection("forward");
    expect(objOrder()).toEqual([A.id, C.id, B.id]);

    arrangeSelection("backward");
    expect(objOrder()).toEqual([C.id, A.id, B.id]);
  });

  it("a no-op arrange (already frontmost) writes no undo step", () => {
    st().select(C.id);
    const undoBefore = st().canUndo;
    arrangeSelection("front");
    expect(objOrder()).toEqual([A.id, B.id, C.id]);
    expect(st().canUndo).toBe(undoBefore);
  });

  it("strokes reorder within their own (ink) layer", () => {
    const s1 = aStroke();
    const s2 = aStroke();
    freshBoard({ strokes: [s1, s2] });
    st().setSelection({ objectIds: [], strokeIds: [s1.id] });
    arrangeSelection("front");
    expect(st().board.strokes.map((s) => s.id)).toEqual([s2.id, s1.id]);
  });
});

describe("grouping", () => {
  it("Ctrl+G semantics: tags the selection; hitting any member selects the group", () => {
    const s = aStroke();
    freshBoard({ objects: [A, B], strokes: [s] });
    st().setSelection({ objectIds: [A.id, B.id], strokeIds: [s.id] });
    groupSelection();

    const gid = st().board.objects[0].groupId;
    expect(typeof gid).toBe("string");
    expect(st().board.objects[1].groupId).toBe(gid);
    expect(st().board.strokes[0].groupId).toBe(gid);

    // The selection algebra resolves any member to the whole group.
    const sel = groupMembers(st().board, "object", B.id);
    expect(new Set(sel.objectIds)).toEqual(new Set([A.id, B.id]));
    expect(sel.strokeIds).toEqual([s.id]);

    // Lasso closure: touching one member pulls the whole group in.
    const expanded = expandToGroups(
      { objectIds: [], strokeIds: [s.id] },
      st().board,
    );
    expect(new Set(expanded.objectIds)).toEqual(new Set([A.id, B.id]));
  });

  it("grouping is one undoable step; ungrouping clears the tags", () => {
    st().setSelection({ objectIds: [A.id, B.id], strokeIds: [] });
    groupSelection();
    expect(st().board.objects[0].groupId).toBeDefined();

    ungroupSelection();
    expect(st().board.objects[0].groupId).toBeUndefined();
    expect(st().board.objects[1].groupId).toBeUndefined();

    st().undo(); // back to grouped
    expect(st().board.objects[0].groupId).toBeDefined();
    st().undo(); // back to ungrouped
    expect(st().board.objects[0].groupId).toBeUndefined();
  });

  it("needs at least two shapes; ungroup needs a grouped member", () => {
    st().select(A.id);
    groupSelection();
    expect(st().board.objects[0].groupId).toBeUndefined();

    const undoBefore = st().canUndo;
    ungroupSelection(); // nothing grouped -> no-op, no undo step
    expect(st().canUndo).toBe(undoBefore);
  });

  it("duplicating a group keeps the clones grouped — under a FRESH id", () => {
    st().setSelection({ objectIds: [A.id, B.id], strokeIds: [] });
    groupSelection();
    const gid = st().board.objects[0].groupId;

    duplicateSelection(); // selects the clones
    const cloneIds = new Set(st().selection.objectIds);
    const clones = st().board.objects.filter((o) => cloneIds.has(o.id));
    expect(clones).toHaveLength(2);
    expect(clones[0].groupId).toBeDefined();
    expect(clones[0].groupId).toBe(clones[1].groupId);
    expect(clones[0].groupId).not.toBe(gid);
  });
});
