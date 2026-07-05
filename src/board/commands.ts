// THE BOARD-COMMAND SERVICE (T3 in docs/canvas-app-architecture.md).
//
// Thin orchestration over store actions: every path that PLACES shapes on the
// board (insert gallery, tool dialogs, image drop, paste/duplicate) and every
// path that EDITS an object's params goes through here, so the "recompute the
// box while preserving the uniform resize scale" rule lives in one place
// (board/sizing.ts) instead of being copied per call site.
//
// The internal clipboard (Ctrl+C/X/V/D) lives here too — it is a placement
// service, not a shortcut; ui/shortcuts.ts only wires keys to it.

import { useBoardStore } from "@/board/store";
import { screenToWorld } from "@/board/geometry";
import { id as makeId } from "@/board/types";
import { naturalSize, scaleOf, sizedBox } from "@/board/sizing";
import { getTool } from "@/tools/registry";
import type { Params } from "@/board/sizing";
import type { AnyBoardObject, Stroke } from "@/board/types";
import { track, trackBoardActivated } from "@/analytics";

// --- placement (CREATE) -----------------------------------------------------

/**
 * How placeObject learns the visible stage size (to centre new objects).
 * The default reads the #stage element; headless tests (no DOM layout) swap in
 * a fixed size via setStageSizeProvider so placement stays deterministic.
 */
export type StageSizeProvider = () => { w: number; h: number };

let stageSize: StageSizeProvider = () => {
  const r = document.getElementById("stage")?.getBoundingClientRect();
  return { w: r?.width ?? 0, h: r?.height ?? 0 };
};

export function setStageSizeProvider(fn: StageSizeProvider): void {
  stageSize = fn;
}

/**
 * Place a new object: centre it on screen with a 22px cascade (mod 6) so
 * successive inserts fan out instead of stacking, then select it and switch to
 * the select tool. `at` (screen px relative to #stage) overrides the centre
 * for drag-dropped images so they land under the cursor; a dropped object
 * skips the cascade. No-op for an unregistered tool type.
 */
export function placeObject(
  type: string,
  params: Params,
  opts: { at?: { x: number; y: number } } = {},
): void {
  const size = naturalSize(type, params);
  if (!size) return;
  const st = useBoardStore.getState();
  const { camera, board } = st;
  const { w: W, h: H } = stageSize();
  const at = opts.at;
  const anchor = screenToWorld(camera, at ? at.x : W / 2, at ? at.y : H / 2);
  const casc = at ? 0 : (board.objects.length % 6) * 22;
  const obj: AnyBoardObject = {
    id: makeId(),
    type,
    x: anchor.x - size.w / 2 + casc,
    y: anchor.y - size.h / 2 + casc,
    w: size.w,
    h: size.h,
    ...params,
  };
  st.addObject(obj);
  st.select(obj.id);
  st.setTool("select");
  // One event for every tool interaction — `action` is the verb, `tool` the
  // registry id (single source of truth). Umami's Properties tab filters by
  // property value, so `tool_action` gives the full tool×action matrix (filter
  // action -> rank tools; filter tool -> see its action mix). Placing a widget
  // also activates the board (fires once/board).
  track("tool_action", { tool: type, action: "created" });
  trackBoardActivated(board.id);
}

// --- editing (EDIT) ----------------------------------------------------------

/**
 * Replace an object's params, keeping its position and preserving any uniform
 * resize: the new box is the new natural size at the OLD scale, so editing
 * settings never snaps the widget back to 1x.
 */
export function editObject(objId: string, params: Params): void {
  const st = useBoardStore.getState();
  const existing = st.board.objects.find((o) => o.id === objId);
  if (!existing) return;
  const size = sizedBox(existing.type, params, scaleOf(existing));
  if (!size) return;
  st.updateObject(objId, { ...params, w: size.w, h: size.h });
  track("tool_action", { tool: existing.type, action: "edited" });
}

// --- z-order (ARRANGE, roadmap A5) -------------------------------------------
// Bring to front / send to back / one step either way, matching the industry
// convention (Ctrl+] / Ctrl+[ and their Shift variants). Objects and strokes
// render on separate canvas layers (ink always above the template), so each
// list is rearranged within itself; a selection spanning both arranges both.

export type ArrangeAction = "front" | "forward" | "backward" | "back";

/**
 * The list rearranged by `action`: selected items keep their relative order.
 * front/back move the whole selected block to the end/start; forward/backward
 * step each selected item past its nearest unselected neighbour (a selected
 * item already at the boundary stays put).
 */
export function rearrange<T extends { id: string }>(
  items: T[],
  selected: ReadonlySet<string>,
  action: ArrangeAction,
): T[] {
  const arr = [...items];
  if (action === "front" || action === "back") {
    const sel = arr.filter((i) => selected.has(i.id));
    const rest = arr.filter((i) => !selected.has(i.id));
    return action === "front" ? [...rest, ...sel] : [...sel, ...rest];
  }
  if (action === "forward") {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selected.has(arr[i].id) && !selected.has(arr[i + 1].id)) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (selected.has(arr[i].id) && !selected.has(arr[i - 1].id)) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
  }
  return arr;
}

/** New order keys after rearranging: every shape is renumbered to its array
 *  index, but only CHANGED keys are returned (and written). */
function reorderedKeys<T extends { id: string; order?: unknown }>(
  items: T[],
  selected: ReadonlySet<string>,
  action: ArrangeAction,
): Record<string, number> {
  const next = rearrange(items, selected, action);
  const out: Record<string, number> = {};
  next.forEach((item, i) => {
    if (item.order !== i) out[item.id] = i;
  });
  return out;
}

/** Apply a z-order action to the current selection (one undoable step). */
export function arrangeSelection(action: ArrangeAction): void {
  const st = useBoardStore.getState();
  const { selection, board } = st;
  if (selection.objectIds.length + selection.strokeIds.length === 0) return;
  const objectOrders = reorderedKeys(
    board.objects,
    new Set(selection.objectIds),
    action,
  );
  const strokeOrders = reorderedKeys(
    board.strokes,
    new Set(selection.strokeIds),
    action,
  );
  if (
    Object.keys(objectOrders).length === 0 &&
    Object.keys(strokeOrders).length === 0
  ) {
    return; // already there — no empty undo step
  }
  st.setShapeOrders(objectOrders, strokeOrders);
}

// --- rotation ----------------------------------------------------------------
// Turn the single selected object by a fixed step (the selection's rotate
// buttons). The by-hand path is the select controller's rotate handle; both
// route through the tool's `rotate` capability.

/** The single selected object whose tool can rotate it, or null. */
export function rotatableSelection(): AnyBoardObject | null {
  const st = useBoardStore.getState();
  const sel = st.selection;
  if (sel.objectIds.length !== 1 || sel.strokeIds.length !== 0) return null;
  const o = st.board.objects.find((x) => x.id === sel.objectIds[0]);
  if (!o) return null;
  const t = getTool(o.type);
  return t && t.kind === "canvas" && t.rotate ? o : null;
}

/** Rotate the single selected rotatable object by `degrees` (one undo step). */
export function rotateSelection(degrees: number): void {
  const o = rotatableSelection();
  if (!o) return;
  const t = getTool(o.type);
  if (!t || t.kind !== "canvas" || !t.rotate) return;
  useBoardStore.getState().updateObject(o.id, t.rotate(o as never, degrees));
  track("tool_action", { tool: o.type, action: "rotated" });
}

// --- grouping (Ctrl+G / Ctrl+Shift+G) ----------------------------------------
// Tag the selected shapes with a fresh shared groupId; from then on hitting
// any member selects the whole group (board/selection.ts). Ungrouping clears
// the tag. Both are single undoable steps.

export function groupSelection(): void {
  const st = useBoardStore.getState();
  const sel = st.selection;
  if (sel.objectIds.length + sel.strokeIds.length < 2) return;
  st.setGroup(sel.objectIds, sel.strokeIds, makeId());
}

export function ungroupSelection(): void {
  const st = useBoardStore.getState();
  const sel = st.selection;
  const { objects, strokes } = st.board;
  const grouped =
    sel.objectIds.some((id) => objects.find((o) => o.id === id)?.groupId) ||
    sel.strokeIds.some((id) => strokes.find((s) => s.id === id)?.groupId);
  if (!grouped) return;
  st.setGroup(sel.objectIds, sel.strokeIds, null);
}

// --- internal clipboard (copy / cut / paste / duplicate) ---------------------
// An INTERNAL clipboard (not the OS clipboard): Ctrl+C/X snapshot the selected
// shapes here, Ctrl+V / Ctrl+D re-insert clones with fresh ids and a cascading
// offset. Matches how Excalidraw/Miro handle in-app copy.

type ShapeBag = { objects: AnyBoardObject[]; strokes: Stroke[] };

/** World-px offset applied to each paste/duplicate so a copy doesn't land
 *  exactly on top of its source. */
const PASTE_OFFSET = 24;

let clipboard: ShapeBag | null = null;
// How many times the CURRENT clipboard has been pasted, so repeated pastes
// cascade instead of stacking. Reset on every copy/cut.
let pasteSeq = 0;

/** Empty the internal clipboard (tests reset between cases; also the hook a
 *  future "clear board" flow would want). */
export function resetClipboard(): void {
  clipboard = null;
  pasteSeq = 0;
}

/** The selected objects + strokes, resolved to their document shapes. */
function selectedShapes(): ShapeBag {
  const st = useBoardStore.getState();
  const objects = st.selection.objectIds
    .map((id) => st.board.objects.find((o) => o.id === id))
    .filter((o): o is AnyBoardObject => o != null);
  const strokes = st.selection.strokeIds
    .map((id) => st.board.strokes.find((s) => s.id === id))
    .filter((s): s is Stroke => s != null);
  return { objects, strokes };
}

/** Deep-clone shapes with fresh ids and a world offset; strips `order` so the
 *  batch re-inserts on top (insertShapes assigns fresh order keys). Group tags
 *  are REMAPPED to fresh ids — clones of a group stay grouped with each other,
 *  never with their source. */
function cloneShapes(src: ShapeBag, dx: number, dy: number): ShapeBag {
  const groupMap = new Map<string, string>();
  const remapGroup = (gid: unknown): string | undefined => {
    if (typeof gid !== "string" || gid === "") return undefined;
    let fresh = groupMap.get(gid);
    if (!fresh) {
      fresh = makeId();
      groupMap.set(gid, fresh);
    }
    return fresh;
  };
  const objects = src.objects.map((o) => {
    const { order, groupId, ...rest } = structuredClone(o);
    void order;
    const gid = remapGroup(groupId);
    return {
      ...rest,
      ...(gid ? { groupId: gid } : {}),
      id: makeId(),
      x: o.x + dx,
      y: o.y + dy,
    };
  });
  const strokes = src.strokes.map((s) => {
    const { order, groupId, ...rest } = structuredClone(s);
    void order;
    const gid = remapGroup(groupId);
    return {
      ...rest,
      ...(gid ? { groupId: gid } : {}),
      id: makeId(),
      points: rest.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  });
  return { objects, strokes };
}

/** Insert a clone batch, then select it and switch to the select tool so the
 *  fresh copy can be moved immediately (mirrors placeObject). */
function placeClones(batch: ShapeBag): void {
  if (batch.objects.length === 0 && batch.strokes.length === 0) return;
  const st = useBoardStore.getState();
  st.addShapes(batch.objects, batch.strokes);
  st.setSelection({
    objectIds: batch.objects.map((o) => o.id),
    strokeIds: batch.strokes.map((s) => s.id),
  });
  st.setTool("select");
}

export function copySelection(): void {
  const sel = selectedShapes();
  if (sel.objects.length === 0 && sel.strokes.length === 0) return;
  clipboard = {
    objects: sel.objects.map((o) => structuredClone(o)),
    strokes: sel.strokes.map((s) => structuredClone(s)),
  };
  pasteSeq = 0;
}

export function pasteClipboard(): void {
  if (!clipboard) return;
  pasteSeq += 1;
  const d = PASTE_OFFSET * pasteSeq;
  placeClones(cloneShapes(clipboard, d, d));
}

export function duplicateSelection(): void {
  const sel = selectedShapes();
  placeClones(cloneShapes(sel, PASTE_OFFSET, PASTE_OFFSET));
}
