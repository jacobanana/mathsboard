// Selection algebra: the pure value helpers the select controller builds on,
// and pressSelection — THE press rule every selectable surface (canvas +
// widget overlay) shares, so groups / shift-toggle / collapse behave the same.

import { describe, expect, it } from "vitest";
import {
  isInSelection,
  pressSelection,
  singleSelection,
  toggleSelection,
} from "@/board/selection";
import { anObject, aStroke } from "@/testing/fixtures";

describe("singleSelection", () => {
  it("wraps an object or a stroke id into the right half of the selection", () => {
    expect(singleSelection("object", "a")).toEqual({
      objectIds: ["a"],
      strokeIds: [],
    });
    expect(singleSelection("stroke", "b")).toEqual({
      objectIds: [],
      strokeIds: ["b"],
    });
  });
});

describe("toggleSelection", () => {
  it("adds an absent item and removes a present one, leaving the other kind alone", () => {
    const base = { objectIds: ["o1"], strokeIds: ["s1"] };
    expect(toggleSelection(base, "object", "o2")).toEqual({
      objectIds: ["o1", "o2"],
      strokeIds: ["s1"],
    });
    expect(toggleSelection(base, "object", "o1")).toEqual({
      objectIds: [],
      strokeIds: ["s1"],
    });
    expect(toggleSelection(base, "stroke", "s1")).toEqual({
      objectIds: ["o1"],
      strokeIds: [],
    });
  });
});

describe("isInSelection", () => {
  it("checks membership by kind", () => {
    const sel = { objectIds: ["o1"], strokeIds: ["s1"] };
    expect(isInSelection(sel, "object", "o1")).toBe(true);
    expect(isInSelection(sel, "stroke", "o1")).toBe(false);
    expect(isInSelection(sel, "stroke", "s1")).toBe(true);
  });
});

describe("pressSelection (the shared press rule)", () => {
  // A and B are grouped (with stroke S); C stands alone.
  const A = anObject({ id: "A", groupId: "g1" });
  const B = anObject({ id: "B", groupId: "g1" });
  const C = anObject({ id: "C" });
  const S = aStroke({ id: "S", groupId: "g1" });
  const board = { objects: [A, B, C], strokes: [S] };
  const none = { objectIds: [], strokeIds: [] };

  it("a plain press selects the pressed item alone", () => {
    expect(pressSelection(board, none, "object", "C", false)).toEqual({
      selection: { objectIds: ["C"], strokeIds: [] },
      collapse: null,
    });
  });

  it("pressing any member of a group selects the whole group", () => {
    const { selection } = pressSelection(board, none, "object", "B", false);
    expect(selection).toEqual({ objectIds: ["A", "B"], strokeIds: ["S"] });
  });

  it("shift-press toggles the whole group in and out, never collapsing", () => {
    const base = { objectIds: ["C"], strokeIds: [] };
    const added = pressSelection(board, base, "object", "A", true);
    expect(added.selection).toEqual({
      objectIds: ["C", "A", "B"],
      strokeIds: ["S"],
    });
    expect(added.collapse).toBeNull();

    const removed = pressSelection(board, added.selection, "stroke", "S", true);
    expect(removed.selection).toEqual({ objectIds: ["C"], strokeIds: [] });
  });

  it("a plain press inside a multi-selection keeps it and records the collapse intent", () => {
    const multi = { objectIds: ["A", "B", "C"], strokeIds: ["S"] };
    const press = pressSelection(board, multi, "object", "C", false);
    expect(press.selection).toBe(multi); // same reference: no store write needed
    expect(press.collapse).toEqual({ kind: "object", id: "C" });
  });

  it("never collapses onto a multi-member group (already the pressed unit)", () => {
    const multi = { objectIds: ["A", "B", "C"], strokeIds: ["S"] };
    const press = pressSelection(board, multi, "object", "A", false);
    expect(press.selection).toBe(multi);
    expect(press.collapse).toBeNull();
  });
});
