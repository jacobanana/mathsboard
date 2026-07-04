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
 *  batch re-inserts on top (insertShapes assigns fresh order keys). */
function cloneShapes(src: ShapeBag, dx: number, dy: number): ShapeBag {
  const objects = src.objects.map((o) => {
    const { order, ...rest } = structuredClone(o);
    void order;
    return { ...rest, id: makeId(), x: o.x + dx, y: o.y + dy };
  });
  const strokes = src.strokes.map((s) => {
    const { order, ...rest } = structuredClone(s);
    void order;
    return {
      ...rest,
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
