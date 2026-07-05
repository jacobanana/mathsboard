// Pure selection algebra (the C7 tidy in docs/canvas-app-architecture.md),
// kept beside the Selection type's owner (board/store.ts). pressSelection is
// THE press rule — every surface that lets a pointer press select something
// (the select controller, the widget overlay) routes through it, so groups,
// shift-toggle and the collapse intent can never diverge between surfaces.

import { selectionCount } from "@/board/store";
import type { Selection } from "@/board/store";
import type { BoardDocument } from "@/board/types";

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

// --- grouping (Ctrl+G) ------------------------------------------------------
// A group is shapes sharing a `groupId` (see board/types.ts). Grouping lives
// entirely in the SELECTION layer: hitting any member selects the whole group,
// and every selection-driven action (move, delete, copy, arrange) then treats
// it as one unit for free.

/** The selection a press on `id` should produce: its whole group when it has
 *  one, else just the item itself. */
export const groupMembers = (
  board: Pick<BoardDocument, "objects" | "strokes">,
  kind: HitKind,
  id: string,
): Selection => {
  const gid =
    kind === "stroke"
      ? board.strokes.find((s) => s.id === id)?.groupId
      : (board.objects.find((o) => o.id === id)?.groupId as string | undefined);
  if (typeof gid !== "string" || gid === "") return singleSelection(kind, id);
  return {
    objectIds: board.objects.filter((o) => o.groupId === gid).map((o) => o.id),
    strokeIds: board.strokes.filter((s) => s.groupId === gid).map((s) => s.id),
  };
};

/**
 * THE PRESS RULE, shared by every selectable surface (canvas + widget layer):
 * what a pointer press on `id` does to the selection, and whether a plain
 * click (no drag) should later COLLAPSE a multi-selection to the pressed item
 * (Figma-style — the caller applies `collapse` on release, drags never do).
 *
 *   - a grouped item stands for its whole group;
 *   - shift toggles membership (whole group at once), never collapses;
 *   - a plain press outside the selection replaces it;
 *   - a plain press on one of many keeps the selection (a drag moves it all)
 *     but records the collapse intent — unless the pressed item IS a
 *     multi-member group (collapsing to the group it's already in is a no-op).
 *
 * Returns the input selection by reference when nothing changes, so callers
 * can skip a store write.
 */
export const pressSelection = (
  board: Pick<BoardDocument, "objects" | "strokes">,
  sel: Selection,
  kind: HitKind,
  id: string,
  shift: boolean,
): { selection: Selection; collapse: { kind: HitKind; id: string } | null } => {
  const members = groupMembers(board, kind, id);
  if (shift) {
    return {
      selection: isInSelection(sel, kind, id)
        ? subtractSelection(sel, members)
        : unionSelection(sel, members),
      collapse: null,
    };
  }
  const inSel = isInSelection(sel, kind, id);
  const groupPress = selectionCount(members) > 1;
  return {
    selection: inSel ? sel : members,
    collapse:
      inSel && selectionCount(sel) > 1 && !groupPress ? { kind, id } : null,
  };
};

export const unionSelection = (a: Selection, b: Selection): Selection => ({
  objectIds: [...new Set([...a.objectIds, ...b.objectIds])],
  strokeIds: [...new Set([...a.strokeIds, ...b.strokeIds])],
});

export const subtractSelection = (a: Selection, b: Selection): Selection => ({
  objectIds: a.objectIds.filter((id) => !b.objectIds.includes(id)),
  strokeIds: a.strokeIds.filter((id) => !b.strokeIds.includes(id)),
});

/** Close a selection over groups: any member present pulls in its whole
 *  group (lasso results, programmatic selections). */
export const expandToGroups = (
  sel: Selection,
  board: Pick<BoardDocument, "objects" | "strokes">,
): Selection => {
  const gids = new Set<string>();
  for (const id of sel.objectIds) {
    const g = board.objects.find((o) => o.id === id)?.groupId;
    if (typeof g === "string" && g !== "") gids.add(g);
  }
  for (const id of sel.strokeIds) {
    const g = board.strokes.find((s) => s.id === id)?.groupId;
    if (typeof g === "string" && g !== "") gids.add(g);
  }
  if (gids.size === 0) return sel;
  const objectIds = new Set(sel.objectIds);
  const strokeIds = new Set(sel.strokeIds);
  for (const o of board.objects) {
    if (typeof o.groupId === "string" && gids.has(o.groupId)) objectIds.add(o.id);
  }
  for (const s of board.strokes) {
    if (typeof s.groupId === "string" && gids.has(s.groupId)) strokeIds.add(s.id);
  }
  return { objectIds: [...objectIds], strokeIds: [...strokeIds] };
};
