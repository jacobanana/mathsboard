// The DRAW tool controller (registered for "pen"): the old pen tool grown
// into the drawing tool. Its `drawMode` (store, ephemeral) toggles between
// freehand ink and the shape kinds (roadmap A2) — one dock button, modes in
// the options pill / shortcut keys.
//
//   free   — delegates every event to the freehand brush controller
//            (canvas/interactions/brush.ts), unchanged behaviour.
//   shapes — drag-to-create: pointer down anchors the shape, dragging
//            previews it live on the ink layer, release commits it as a
//            `shape` canvas object, selects it and hands over to the select
//            tool (the Excalidraw/Figma convention), where its vertex handles
//            take over for parametric edits.
//
// Modifiers while dragging (industry conventions):
//   Shift — lines/arrows snap to 15° directions; boxed shapes stay square.
//   Alt   — bypasses grid snapping for this gesture.

import { id as newId } from "@/board/types";
import type { AnyBoardObject } from "@/board/types";
import { snapPt } from "@/board/geometry";
import { penController } from "@/canvas/interactions/brush";
import {
  hasAngles,
  isClosed,
  shapeFromDrag,
  snapDirection,
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

interface LiveShape {
  pid: number;
  kind: ShapeKind;
  /** Anchor (world coords, already snapped when snapping is on). */
  a: Pt;
  /** Current drag point (world coords, snapped/constrained). */
  b: Pt;
  /** Shift held: square boxes / 15°-stepped lines. */
  square: boolean;
}

let live: LiveShape | null = null;

/** Grid snapping applies on squared paper with the toggle on; Alt bypasses. */
function snapping(c: InputCtx, e: PointerEvent): boolean {
  const st = c.store.getState();
  return st.snap && st.board.background === "squared" && !e.altKey;
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

export const drawController: InteractionController = {
  tool: "pen",
  // Freehand: the brush ring IS the cursor. Shape modes override per-hover.
  cursor: "none",

  hoverCursor(e, c) {
    if (c.store.getState().drawMode === "free") {
      return penController.hoverCursor!(e, c);
    }
    return "crosshair";
  },

  onPointerDown(e, c) {
    const st = c.store.getState();
    if (st.drawMode === "free") {
      penController.onPointerDown(e, c);
      return;
    }
    const pp = c.evPos(e);
    let a = c.toWorld(pp.x, pp.y);
    if (snapping(c, e)) a = snapPt(a);
    live = { pid: e.pointerId, kind: st.drawMode, a, b: a, square: e.shiftKey };
    c.render();
  },

  onPointerMove(e, c) {
    if (!live) {
      penController.onPointerMove(e, c);
      return;
    }
    if (e.pointerId !== live.pid) return;
    const pp = c.evPos(e);
    let b = c.toWorld(pp.x, pp.y);
    live.square = e.shiftKey;
    if (e.shiftKey && (live.kind === "line" || live.kind === "arrow")) {
      // Direction constraint wins over the grid (they rarely agree).
      b = snapDirection(live.a, b);
    } else if (snapping(c, e)) {
      b = snapPt(b);
    }
    live.b = b;
    c.render();
  },

  onPointerUp(e, c) {
    if (!live) {
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

    const obj: AnyBoardObject = {
      id: newId(),
      type: "shape",
      x: built.x,
      y: built.y,
      w: built.params.nw,
      h: built.params.nh,
      ...built.params,
    };
    st.addObject(obj);
    st.select(obj.id);
    // Hand over to select so the fresh shape's handles are live immediately
    // (the same convention placeObject follows for gallery widgets).
    st.setTool("select");
    track("tool_action", { tool: "shape", action: "created", kind: drag.kind });
    trackBoardActivated(st.board.id);
  },

  cancel(c) {
    if (live) {
      live = null;
      c.render();
    }
    penController.cancel!(c);
  },

  onPointerLeave(c) {
    penController.onPointerLeave!(c);
  },

  drawOverlay(kit, c) {
    if (c.store.getState().drawMode === "free") {
      penController.drawOverlay!(kit, c);
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
