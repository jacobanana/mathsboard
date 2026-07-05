// The DRAW tool controller (registered for "pen"): the old pen tool grown
// into the drawing tool. Its `drawMode` (store, ephemeral) toggles between
// freehand ink and the shape kinds (roadmap A2) — one dock button, modes in
// the options pill / shortcut keys.
//
//   free     — delegates every event to the freehand brush controller
//              (canvas/interactions/brush.ts), unchanged behaviour.
//   freepoly — point-by-point polygon: each click drops a corner, clicking
//              back on the first corner (or double-click / Enter) closes the
//              shape into a `polygon` object; Escape abandons it.
//   shapes   — drag-to-create: pointer down anchors the shape, dragging
//              previews it live on the ink layer, release commits it as a
//              `shape` canvas object. The DRAW TOOL STAYS ACTIVE so several
//              shapes can be drawn in a row; switch to Select (1/V) to edit.
//
// Modifiers while dragging:
//   Shift — temporarily FLIPS grid snapping for the gesture (on->off, off->on).
//   Alt   — bypasses all snapping (grid + magnetic angles) for the gesture.
// Lines/arrows magnetise onto 15° directions on their own (weakly — see
// magneticDirection); rect/ellipse lock square via the SQUARE/CIRCLE toggle.

import { id as newId } from "@/board/types";
import type { AnyBoardObject } from "@/board/types";
import { snapPt } from "@/board/geometry";
import { useBoardStore } from "@/board/store";
import { penController } from "@/canvas/interactions/brush";
import {
  hasAngles,
  isClosed,
  magneticDirection,
  renormalize,
  shapeFromDrag,
} from "@/tools/shape/geometry";
import type { Pt, ShapeKind } from "@/tools/shape/geometry";
import { drawShapeGeometry, NO_FILL } from "@/tools/shape";
import type { ShapeParams } from "@/tools/shape";
import { SHAPE_WIDTH_RANGE } from "@/ui/constants";
import { track, trackBoardActivated } from "@/analytics";
import type {
  InputCtx,
  InteractionController,
} from "@/canvas/interactions/types";

/** Minimum drag (screen px) for a release to commit a shape — anything less
 *  is a stray tap. */
const MIN_DRAG_PX = 6;

/** Screen-px radius around the FIRST freepoly corner that closes the shape. */
const CLOSE_PX = 14;

interface LiveShape {
  pid: number;
  kind: ShapeKind;
  /** Anchor (world coords, already snapped when snapping is on). */
  a: Pt;
  /** Current drag point (world coords, snapped/constrained). */
  b: Pt;
  /** Aspect lock: square boxes / circles (the store toggle). */
  square: boolean;
}

let live: LiveShape | null = null;

/** The in-progress point-by-point polygon (freepoly mode). */
interface LivePoly {
  pts: Pt[];
  /** Last hover position (world), for the elastic edge preview. */
  cursor: Pt | null;
}

let poly: LivePoly | null = null;
/** The pressed pointer of a would-be freepoly click (committed on release). */
let polyPress: { pid: number } | null = null;

/**
 * Grid snapping for a gesture: the toggle on squared paper, EXCEPT while
 * Shift is held — Shift temporarily flips the setting either way. Alt
 * bypasses everything.
 */
function snapping(
  c: InputCtx,
  e: { altKey: boolean; shiftKey: boolean },
): boolean {
  const st = c.store.getState();
  return (
    st.snap !== e.shiftKey && st.board.background === "squared" && !e.altKey
  );
}

function shapeStyleParams(c: InputCtx, kind: ShapeKind): Omit<ShapeParams, "kind" | "nw" | "nh" | "pts"> {
  const st = c.store.getState();
  return {
    stroke: st.color,
    strokeWidth: Math.min(Math.max(st.penSize, SHAPE_WIDTH_RANGE.min), SHAPE_WIDTH_RANGE.max),
    fill: isClosed(kind) ? st.fillColor : NO_FILL,
    dash: false,
    // The angle measures ARE the teaching content — on by default wherever
    // they exist; the dialog can hide them.
    showAngles: hasAngles(kind),
    both: false,
  };
}

/** Commit a finished shape object. The draw tool STAYS active (no select
 *  hand-over) so the next shape can be drawn immediately. */
function commitShape(
  c: InputCtx,
  kind: ShapeKind,
  x: number,
  y: number,
  params: ShapeParams,
): void {
  const st = c.store.getState();
  const obj: AnyBoardObject = {
    id: newId(),
    type: "shape",
    x,
    y,
    w: params.nw,
    h: params.nh,
    ...params,
  };
  st.addObject(obj);
  track("tool_action", { tool: "shape", action: "created", kind });
  trackBoardActivated(st.board.id);
}

/** The live drag as full shape params + world origin (preview & commit). */
function liveShape(c: InputCtx): { params: ShapeParams; x: number; y: number } | null {
  if (!live) return null;
  const st = c.store.getState();
  const d = shapeFromDrag(live.kind, live.a, live.b, {
    sides: st.polygonSides,
    square: live.square,
  });
  return {
    params: {
      kind: live.kind,
      nw: d.nw,
      nh: d.nh,
      pts: d.pts,
      ...shapeStyleParams(c, live.kind),
    },
    x: d.x,
    y: d.y,
  };
}

// --- freepoly (point-by-point polygon) --------------------------------------

/** Is a point-by-point polygon currently being placed? (Shortcut gating.) */
export function freePolyActive(): boolean {
  return poly != null;
}

/** Nudge the canvas to redraw after module-local state changed outside an
 *  InputCtx (the Enter/Escape shortcuts): re-set the selection with a fresh
 *  reference — same content, but BoardCanvas's subscription repaints on it. */
function pokeRender(): void {
  const st = useBoardStore.getState();
  st.setSelection({ ...st.selection });
}

/** Abandon the in-progress polygon (Escape / tool cancel). */
export function cancelFreePoly(): void {
  if (!poly) return;
  poly = null;
  polyPress = null;
  pokeRender();
}

/** Close the in-progress polygon into a `polygon` shape object (needs ≥ 3
 *  corners; fewer is abandoned). Exposed for the Enter shortcut. */
export function finishFreePoly(c?: InputCtx): void {
  if (!poly) return;
  const pts = [...poly.pts];
  poly = null;
  polyPress = null;
  // A double-click lands as two near-identical clicks; drop the duplicate.
  while (
    pts.length > 1 &&
    Math.hypot(
      pts[pts.length - 1].x - pts[pts.length - 2].x,
      pts[pts.length - 1].y - pts[pts.length - 2].y,
    ) < 1
  ) {
    pts.pop();
  }
  if (pts.length < 3) {
    pokeRender();
    return;
  }
  const st = useBoardStore.getState();
  const n = renormalize(pts);
  const params: ShapeParams = {
    kind: "polygon",
    nw: n.nw,
    nh: n.nh,
    pts: n.pts,
    stroke: st.color,
    strokeWidth: Math.min(
      Math.max(st.penSize, SHAPE_WIDTH_RANGE.min),
      SHAPE_WIDTH_RANGE.max,
    ),
    fill: st.fillColor,
    dash: false,
    showAngles: true,
    both: false,
  };
  const obj: AnyBoardObject = {
    id: newId(),
    type: "shape",
    x: n.ox,
    y: n.oy,
    w: n.nw,
    h: n.nh,
    ...params,
  };
  st.addObject(obj);
  track("tool_action", { tool: "shape", action: "created", kind: "freepoly" });
  trackBoardActivated(st.board.id);
  if (c) c.render();
  else pokeRender();
}

/** One freepoly click: start the polygon, close it (near the first corner),
 *  or append a corner. */
function freePolyClick(e: PointerEvent, c: InputCtx): void {
  const st = c.store.getState();
  const pp = c.evPos(e);
  const raw = c.toWorld(pp.x, pp.y);
  const w = snapping(c, e) ? snapPt(raw) : raw;
  if (poly && poly.pts.length >= 3) {
    // Close on the first corner: within the screen radius of it, or (with
    // snapping on) landing on exactly its grid node.
    const d0 =
      Math.hypot(raw.x - poly.pts[0].x, raw.y - poly.pts[0].y) *
      st.camera.scale;
    const sameNode = w.x === poly.pts[0].x && w.y === poly.pts[0].y;
    if (d0 <= CLOSE_PX || sameNode) {
      finishFreePoly(c);
      return;
    }
  }
  if (!poly) poly = { pts: [w], cursor: w };
  else poly.pts.push(w);
  c.render();
}

export const drawController: InteractionController = {
  tool: "pen",
  // Freehand: the brush ring IS the cursor. Shape modes override per-hover.
  cursor: "none",

  hoverCursor(e, c) {
    const mode = c.store.getState().drawMode;
    if (mode === "free") {
      return penController.hoverCursor!(e, c);
    }
    if (mode === "freepoly" && poly) {
      // Track the hover so the elastic edge follows the cursor.
      const pp = c.evPos(e);
      poly.cursor = c.toWorld(pp.x, pp.y);
      c.render();
    }
    return "crosshair";
  },

  onPointerDown(e, c) {
    const st = c.store.getState();
    if (st.drawMode === "free") {
      poly = null;
      penController.onPointerDown(e, c);
      return;
    }
    if (st.drawMode === "freepoly") {
      polyPress = { pid: e.pointerId };
      return;
    }
    poly = null;
    const pp = c.evPos(e);
    let a = c.toWorld(pp.x, pp.y);
    if (snapping(c, e)) a = snapPt(a);
    live = {
      pid: e.pointerId,
      kind: st.drawMode,
      a,
      b: a,
      square: st.aspectLock,
    };
    c.render();
  },

  onPointerMove(e, c) {
    if (!live) {
      if (c.store.getState().drawMode === "freepoly") {
        if (poly && polyPress) {
          const pp = c.evPos(e);
          poly.cursor = c.toWorld(pp.x, pp.y);
          c.render();
        }
        return;
      }
      penController.onPointerMove(e, c);
      return;
    }
    if (e.pointerId !== live.pid) return;
    const pp = c.evPos(e);
    let b = c.toWorld(pp.x, pp.y);
    if (live.kind === "rect" || live.kind === "ellipse") {
      live.square = c.store.getState().aspectLock;
    }
    if (live.kind === "line" || live.kind === "arrow") {
      // Weak 15° direction magnet, always on; grid snap where it disengages.
      const m = e.altKey ? null : magneticDirection(live.a, b);
      if (m) b = m;
      else if (snapping(c, e)) b = snapPt(b);
    } else if (snapping(c, e)) {
      b = snapPt(b);
    }
    live.b = b;
    c.render();
  },

  onPointerUp(e, c) {
    if (!live) {
      if (polyPress && e.pointerId === polyPress.pid) {
        polyPress = null;
        if (e.type !== "pointercancel") freePolyClick(e, c);
        return;
      }
      penController.onPointerUp(e, c);
      return;
    }
    if (e.pointerId !== live.pid) return;
    const st = c.store.getState();
    const built = liveShape(c);
    const drag = live;
    live = null;
    c.render(); // clear the preview even when nothing commits
    if (e.type === "pointercancel" || !built) return;
    const dragPx =
      Math.hypot(drag.b.x - drag.a.x, drag.b.y - drag.a.y) * st.camera.scale;
    if (dragPx < MIN_DRAG_PX) return;

    commitShape(c, drag.kind, built.x, built.y, built.params);
  },

  onDoubleClick(_e, c) {
    // Double-click finishes the point-by-point polygon.
    if (c.store.getState().drawMode === "freepoly") finishFreePoly(c);
  },

  cancel(c) {
    if (live) {
      live = null;
      c.render();
    }
    if (poly) {
      poly = null;
      polyPress = null;
      c.render();
    }
    penController.cancel!(c);
  },

  onPointerLeave(c) {
    penController.onPointerLeave!(c);
  },

  drawOverlay(kit, c) {
    const mode = c.store.getState().drawMode;
    if (mode === "free") {
      penController.drawOverlay!(kit, c);
      return;
    }
    if (mode === "freepoly" && poly) {
      const style = shapeStyleParams(c, "polygon");
      const ink = kit.ink;
      const { pts, cursor } = poly;
      ink.save();
      ink.globalAlpha = 0.9;
      ink.strokeStyle = style.stroke;
      ink.lineWidth = style.strokeWidth;
      ink.lineCap = "round";
      ink.lineJoin = "round";
      ink.beginPath();
      ink.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ink.lineTo(pts[i].x, pts[i].y);
      if (cursor) ink.lineTo(cursor.x, cursor.y);
      ink.stroke();
      // Corner dots; the FIRST corner grows a ring once the shape can close.
      const r = 4 / kit.camera.scale;
      ink.fillStyle = style.stroke;
      for (const p of pts) {
        ink.beginPath();
        ink.arc(p.x, p.y, r, 0, Math.PI * 2);
        ink.fill();
      }
      if (pts.length >= 3) {
        ink.strokeStyle = kit.theme.accent;
        ink.lineWidth = 2 / kit.camera.scale;
        ink.beginPath();
        ink.arc(pts[0].x, pts[0].y, (CLOSE_PX - 4) / kit.camera.scale, 0, Math.PI * 2);
        ink.stroke();
      }
      ink.restore();
      return;
    }
    if (!live) return;
    const built = liveShape(c);
    if (!built) return;
    kit.ink.save();
    kit.ink.globalAlpha = 0.9;
    drawShapeGeometry(kit.ink, built.params, built.x, built.y);
    kit.ink.restore();
  },
};
