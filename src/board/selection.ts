// Pure selection algebra (the C7 tidy in docs/canvas-app-architecture.md),
// kept beside the Selection type's owner (board/store.ts). The "collapse a
// multi-select on plain click" RULE lives in the select interaction controller;
// these are only the value helpers it (and future tools) build on.

import type { Selection } from "@/board/store";

/** What a pointer press landed on. Strokes sit visually above objects. */
export type HitKind = "object" | "stroke";

/** A selection containing exactly the one pressed item. */
export const singleSelection = (kind: HitKind, id: string): Selection =>
  kind === "stroke"
    ? { objectIds: [], strokeIds: [id] }
    : { objectIds: [id], strokeIds: [] };

/** Add/remove one item from a selection (shift-click toggle). */
export const toggleSelection = (
  sel: Selection,
  kind: HitKind,
  id: string,
): Selection => {
  const key = kind === "stroke" ? "strokeIds" : "objectIds";
  const arr = sel[key];
  const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  return { ...sel, [key]: next };
};

export const isInSelection = (sel: Selection, kind: HitKind, id: string): boolean =>
  (kind === "stroke" ? sel.strokeIds : sel.objectIds).includes(id);
