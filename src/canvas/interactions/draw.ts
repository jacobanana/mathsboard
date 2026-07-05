// The DRAW tool controller (registered for "pen"): the old pen tool grown
// into the drawing tool. Its `drawMode` (store, ephemeral) toggles between
// freehand ink and the shape kinds (roadmap A2) — one dock button, modes in
// the options pill / shortcut keys.
//
//   free       — delegates every event to the freehand brush controller
//                (canvas/interactions/brush.ts), unchanged behaviour.
//   freepoly / — CLICK-TO-PLACE (CAD style): each click drops a point.
//   curve        freepoly closes back onto its first corner into a polygon;
//                curve is open — every click extends the spline. Double-click
//                or Enter finishes either; Escape abandons.
//   shapes     — drag-to-create: pointer down anchors the shape, dragging
//                previews it live on the ink layer, release commits it as a
//                `shape` canvas object.
//
// Every commit SELECTS the fresh shape but KEEPS the draw tool active: the
// selection frame shows the shape is live/editable (drawSelectionOutlines is
// shared with the select controller) while the next shape can be drawn
// immediately. Switch to Select (1/V) to grab its handles.
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
import { drawSelectionOutlines } from "@/canvas/interactions/select";
import {
  hasAngles,
  isClosed,
  magneticDirection,
  renormalize,
  shapeFromDrag,
} from "@/tools/shape/geometry";
import type { Pt, ShapeKind } from "@/tools/shape/geometry";
import { drawShapeGeometry, NO_FILL, shapeTool } from "@/tools/shape";
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

/**
 * The in-progress CLICK-TO-PLACE session (point polygon / curve). CREATION
 * IS EDITING: the object is committed to the document the moment it has
 * enough points (2 for a curve, 3 for a polygon) and every further click
 * APPENDS a point through updateObject — one undo step per point, exactly
 * like editing afterwards. Only the first click(s) below the minimum are
 * held locally (`pending`); the finishing gesture never adds a point.
 */
interface Placing {
  kind: "freepoly" | "curve";
  /** Points placed before the object exists (fewer than the minimum). */
  pending: Pt[];
  /** The live document object's id once the minimum count is reached. */
  id: string | null;
  /** Last hover position (world), for the elastic segment preview. */
  cursor: Pt | null;
  /** Last click (screen px + ms): a quick second click on the same spot is
   *  the double-click's second half — it FINISHES instead of adding. */
  last: { sx: number; sy: number; at: number } | null;
}

let placing: Placing | null = null;
/** The pressed pointer of a would-be placement click (committed on release). */
let placePress: { pid: number } | null = null;

const placementMode = (m: string): m is Placing["kind"] =>
  m === "freepoly" || m === "curve";

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

/** Commit a finished shape object: select it (its frame shows it's live) but
 *  KEEP the draw tool active so the next shape can be drawn immediately. */
function commitShape(
  kind: ShapeKind,
  x: number,
  y: number,
  params: ShapeParams,
  trackedAs: string = kind,
): string {
  const st = useBoardStore.getState();
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
  st.select(obj.id);
  track("tool_action", { tool: "shape", action: "created", kind: trackedAs });
  trackBoardActivated(st.board.id);
  return obj.id;
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

// --- click-to-place (freepoly + curve) ---------------------------------------

/** Is a click-to-place shape currently being built? (Shortcut gating.) */
export function placementActive(): boolean {
  return placing != null;
}

/** Nudge the canvas to redraw after module-local state changed outside an
 *  InputCtx (the Enter/Escape shortcuts): re-set the selection with a fresh
 *  reference — same content, but BoardCanvas's subscription repaints on it. */
function pokeRender(): void {
  const st = useBoardStore.getState();
  st.setSelection({ ...st.selection });
}

/** How many points a placement needs before the object gets committed. */
const minPoints = (kind: Placing["kind"]): number =>
  kind === "freepoly" ? 3 : 2;

/** The session's points in WORLD coords: the live object's (it may have been
 *  reshaped by undo mid-session) or the pending clicks. */
function sessionPoints(): Pt[] {
  if (!placing) return [];
  if (placing.id == null) return placing.pending;
  const st = useBoardStore.getState();
  const o = st.board.objects.find((x) => x.id === placing!.id);
  if (!o) return [];
  const pts = (o.pts as Pt[]) ?? [];
  const s = (o.w as number) / Math.max(o.nw as number, 1);
  return pts.map((p) => ({ x: (o.x as number) + p.x * s, y: (o.y as number) + p.y * s }));
}

/**
 * End the in-progress placement session. The object (if it reached its
 * minimum and was committed) simply STAYS — finishing never writes anything,
 * so the closing gesture can't add stray points. Below the minimum, the
 * pending clicks are discarded. Exposed for the Enter/Escape shortcuts.
 */
export function finishPlacement(c?: InputCtx): void {
  if (!placing) return;
  placing = null;
  placePress = null;
  if (c) c.render();
  else pokeRender();
}

/** Alias of finishPlacement for the Escape shortcut / tool cancel: ending is
 *  all there is — committed points are undone per click, not abandoned. */
export function cancelPlacement(): void {
  finishPlacement();
}

/** Build + commit the placement object once the minimum count is reached. */
function commitPlacement(kind: Placing["kind"], pts: Pt[]): string {
  const st = useBoardStore.getState();
  const n = renormalize(pts);
  const shapeKind: ShapeKind = kind === "freepoly" ? "polygon" : "curve";
  const params: ShapeParams = {
    kind: shapeKind,
    nw: n.nw,
    nh: n.nh,
    pts: n.pts,
    stroke: st.color,
    strokeWidth: Math.min(
      Math.max(st.penSize, SHAPE_WIDTH_RANGE.min),
      SHAPE_WIDTH_RANGE.max,
    ),
    fill: shapeKind === "polygon" ? st.fillColor : NO_FILL,
    dash: false,
    showAngles: shapeKind === "polygon",
    both: false,
  };
  return commitShape(shapeKind, n.ox, n.oy, params, kind);
}

/** A quick second click on (nearly) the same spot is the double-click's
 *  second half — treat it as "finish", never as another point. */
const DOUBLE_PX = 6;
const DOUBLE_MS = 400;

/** One placement click: start the session, finish it (double-click's second
 *  half / a freepoly click back on the first corner), or add a point — as
 *  its OWN undo step once the object exists. */
function placeClick(e: PointerEvent, c: InputCtx): void {
  const st = c.store.getState();
  const mode = st.drawMode;
  if (!placementMode(mode)) return;
  if (placing && placing.kind !== mode) placing = null; // mode switched mid-build
  const pp = c.evPos(e);
  const now = Date.now();
  if (
    placing?.last &&
    now - placing.last.at < DOUBLE_MS &&
    Math.hypot(pp.x - placing.last.sx, pp.y - placing.last.sy) <= DOUBLE_PX
  ) {
    finishPlacement(c);
    return;
  }
  const raw = c.toWorld(pp.x, pp.y);
  const w = snapping(c, e) ? snapPt(raw) : raw;
  const world = sessionPoints();
  if (placing && placing.kind === "freepoly" && world.length >= 3) {
    // Close on the first corner: within the screen radius of it, or (with
    // snapping on) landing on exactly its grid node.
    const d0 =
      Math.hypot(raw.x - world[0].x, raw.y - world[0].y) * st.camera.scale;
    const sameNode = w.x === world[0].x && w.y === world[0].y;
    if (d0 <= CLOSE_PX || sameNode) {
      finishPlacement(c);
      return;
    }
  }
  if (!placing) {
    placing = { kind: mode, pending: [], id: null, cursor: w, last: null };
  }
  placing.last = { sx: pp.x, sy: pp.y, at: now };
  if (placing.id == null) {
    placing.pending.push(w);
    if (placing.pending.length >= minPoints(placing.kind)) {
      // Enough points: the object goes LIVE in the document (one undo step
      // covers this creation); further clicks append to it.
      placing.id = commitPlacement(placing.kind, placing.pending);
      placing.pending = [];
    }
    c.render();
    return;
  }
  // Append to the live object through the shape tool's own insert (it keeps
  // tangents/renormalisation right) — one undoable step per point.
  const obj = st.board.objects.find((o) => o.id === placing!.id);
  if (!obj) {
    // Undone back past the creation: this click starts over.
    placing.pending = [w];
    placing.id = null;
    c.render();
    return;
  }
  const cap = shapeTool.vertices!;
  const ins = cap.insert!(obj as never, (obj.pts as Pt[]).length - 1, w.x, w.y);
  if (ins) st.updateObject(obj.id, ins.patch);
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
    if (placementMode(mode) && placing) {
      // Track the hover so the elastic segment follows the cursor.
      const pp = c.evPos(e);
      placing.cursor = c.toWorld(pp.x, pp.y);
      c.render();
    }
    return "crosshair";
  },

  onPointerDown(e, c) {
    const st = c.store.getState();
    if (st.drawMode === "free") {
      placing = null;
      penController.onPointerDown(e, c);
      return;
    }
    if (placementMode(st.drawMode)) {
      placePress = { pid: e.pointerId };
      return;
    }
    placing = null;
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
      if (placementMode(c.store.getState().drawMode)) {
        if (placing && placePress) {
          const pp = c.evPos(e);
          placing.cursor = c.toWorld(pp.x, pp.y);
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
      if (placePress && e.pointerId === placePress.pid) {
        placePress = null;
        if (e.type !== "pointercancel") placeClick(e, c);
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

    commitShape(drag.kind, built.x, built.y, built.params);
  },

  onDoubleClick(_e, c) {
    // Double-click finishes the click-to-place shape (freepoly / curve).
    if (placementMode(c.store.getState().drawMode)) finishPlacement(c);
  },

  cancel(c) {
    if (live) {
      live = null;
      c.render();
    }
    if (placing) {
      placing = null;
      placePress = null;
      c.render();
    }
    penController.cancel!(c);
  },

  onPointerLeave(c) {
    penController.onPointerLeave!(c);
  },

  drawOverlay(kit, c) {
    const st = c.store.getState();
    const mode = st.drawMode;
    if (mode === "free") {
      penController.drawOverlay!(kit, c);
      return;
    }
    // Freshly committed shapes stay selected while the draw tool is active:
    // their frame marks them as editable (shared with the select controller).
    drawSelectionOutlines(kit, st);

    if (placementMode(mode) && placing) {
      // The committed part of the shape renders as the REAL object via the
      // scene (creation is editing). The overlay adds only the session
      // chrome: the pending pre-minimum polyline, a dashed elastic guide to
      // the cursor, dots on every point, and the freepoly close ring.
      const style = shapeStyleParams(
        c,
        placing.kind === "freepoly" ? "polygon" : "curve",
      );
      const ink = kit.ink;
      const { cursor } = placing;
      const world = sessionPoints();
      ink.save();
      ink.globalAlpha = 0.9;
      ink.strokeStyle = style.stroke;
      ink.lineWidth = style.strokeWidth;
      ink.lineCap = "round";
      ink.lineJoin = "round";
      if (placing.id == null && world.length > 1) {
        // Below the minimum: the object doesn't exist yet, preview the run.
        ink.beginPath();
        ink.moveTo(world[0].x, world[0].y);
        for (let i = 1; i < world.length; i++) ink.lineTo(world[i].x, world[i].y);
        ink.stroke();
      }
      if (cursor && world.length > 0) {
        // Elastic guide: where the NEXT click would extend the shape.
        const last = world[world.length - 1];
        ink.save();
        ink.lineWidth = Math.max(1.5, style.strokeWidth * 0.5);
        ink.setLineDash([6 / kit.camera.scale, 5 / kit.camera.scale]);
        ink.beginPath();
        ink.moveTo(last.x, last.y);
        ink.lineTo(cursor.x, cursor.y);
        ink.stroke();
        ink.restore();
      }
      const r = 4 / kit.camera.scale;
      ink.fillStyle = style.stroke;
      for (const p of world) {
        ink.beginPath();
        ink.arc(p.x, p.y, r, 0, Math.PI * 2);
        ink.fill();
      }
      if (placing.kind === "freepoly" && world.length >= 3) {
        ink.strokeStyle = kit.theme.accent;
        ink.lineWidth = 2 / kit.camera.scale;
        ink.beginPath();
        ink.arc(world[0].x, world[0].y, (CLOSE_PX - 4) / kit.camera.scale, 0, Math.PI * 2);
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
