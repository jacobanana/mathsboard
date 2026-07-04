// Selection algebra: the pure value helpers the select controller builds on.

import { describe, expect, it } from "vitest";
import {
  isInSelection,
  singleSelection,
  toggleSelection,
} from "@/board/selection";

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
