// Resize math + policy (the C8 tidy in docs/canvas-app-architecture.md),
// beside geometry.ts: which object shows handles, the aspect-locked box
// derivation for a handle drag, and the cursor per handle.

import { getTool } from "@/tools/registry";
import type { AnyBoardObject } from "@/board/types";
import type { ResizeHandle } from "@/board/geometry";
import type { Selection } from "@/board/store";

/** Resize-handle hit tolerance (screen px) and minimum object size (world px). */
export const HANDLE_SLOP = 12;
export const MIN_OBJ = 24;

/** Pointer cursor per resize handle. */
export const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

/**
 * The lone canvas object eligible for resize handles: exactly one object (and no
 * strokes) selected, and its tool draws onto the canvas. Widgets render as HTML
 * overlays above the canvas, so their handles would be occluded -- skip them.
 */
export function singleResizableObject(
  objects: AnyBoardObject[],
  selection: Selection,
): AnyBoardObject | null {
  if (selection.objectIds.length !== 1 || selection.strokeIds.length !== 0) {
    return null;
  }
  const o = objects.find((x) => x.id === selection.objectIds[0]);
  if (!o) return null;
  const t = getTool(o.type);
  return t && t.kind === "canvas" ? o : null;
}

/**
 * New box for an object whose `handle` is dragged to world point (wx, wy). By
 * default the object keeps its original w:h aspect ratio; pass `free` to let
 * each axis move independently (a widget whose layout reflows to any box). The
 * opposite edge/corner stays anchored; each moving edge is clamped to MIN_OBJ.
 *
 *   - Corner handle: the pointer drives both axes; the box grows on whichever
 *     axis moved furthest and the other axis is derived from the ratio.
 *   - Edge handle: the dragged axis drives, the perpendicular axis is derived
 *     and kept centred on the object's unchanged mid-line.
 *
 * With `free`, both the ratio derivation and the re-centring are skipped: the
 * dragged edges land exactly where the pointer put them.
 */
export function resizeRect(
  o: { x: number; y: number; w: number; h: number },
  handle: ResizeHandle,
  wx: number,
  wy: number,
  free = false,
): { x: number; y: number; w: number; h: number } {
  const ar = o.h > 0 ? o.w / o.h : 1;
  let l = o.x;
  let t = o.y;
  let r = o.x + o.w;
  let b = o.y + o.h;
  const left = handle.includes("w");
  const right = handle.includes("e");
  const top = handle.includes("n");
  const bottom = handle.includes("s");
  if (left) l = Math.min(wx, r - MIN_OBJ);
  if (right) r = Math.max(wx, l + MIN_OBJ);
  if (top) t = Math.min(wy, b - MIN_OBJ);
  if (bottom) b = Math.max(wy, t + MIN_OBJ);

  let w = r - l;
  let h = b - t;
  const horiz = left || right;
  const vert = top || bottom;

  // Free resize: each dragged edge is already clamped in place — no ratio.
  if (free) return { x: l, y: t, w, h };

  if (horiz && vert) {
    // Corner: dominant axis wins, derive the other, anchor opposite corner.
    if (w / ar >= h) h = w / ar;
    else w = h * ar;
    if (left) l = r - w;
    else r = l + w;
    if (top) t = b - h;
    else b = t + h;
  } else if (horiz) {
    // Side handle: width drives, derive height, keep vertically centred.
    h = w / ar;
    const cy = o.y + o.h / 2;
    t = cy - h / 2;
    b = cy + h / 2;
  } else if (vert) {
    // Top/bottom handle: height drives, derive width, keep horizontally centred.
    w = h * ar;
    const cx = o.x + o.w / 2;
    l = cx - w / 2;
    r = cx + w / 2;
  }
  return { x: l, y: t, w: r - l, h: b - t };
}
