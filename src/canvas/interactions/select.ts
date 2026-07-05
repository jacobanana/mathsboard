// The select interaction controller: press-to-select (strokes win over
// objects), shift-toggle, drag-to-move the whole selection, resize via the
// single selected object's handles, rubber-band ("lasso") area select on empty
// space, and the Figma-style collapse of a multi-select on a plain click. Its
// overlay contributes the selection outlines, resize handles and lasso rect.
//
// Two further capabilities live here (not in the host):
//   - GROUPS: hitting any member of a group selects the whole group
//     (board/selection.ts owns the algebra); lasso results are closed over
//     groups too.
//   - VERTEX HANDLES: a single selected object whose tool exposes the
//     `vertices` capability (the shape tool's triangle corners, line
//     endpoints, Bézier controls) gets round draggable handles, rendered and
//     driven generically off the tool contract.

import {
  hitTest,
  hitTestStroke,
  hitTestHandle,
  handleCenters,
  normRect,
  objectInRect,
  snapPt,
  strokeBounds,
  strokeInRect,
  worldToScreen,
  RESIZE_HANDLES,
} from "@/board/geometry";
import type { ResizeHandle } from "@/board/geometry";
import {
  groupMembers,
  pressSelection,
  expandToGroups,
} from "@/board/selection";
import type { HitKind } from "@/board/selection";
import {
  HANDLE_SLOP,
  RESIZE_CURSOR,
  resizeRect,
  singleResizableObject,
} from "@/board/resize";
import { getTool } from "@/tools/registry";
import type { VertexCapability } from "@/tools/registry";
import type { DrawMode } from "@/board/store";
import { niceAngleTarget } from "@/tools/shape/geometry";
import {
  laserDown,
  laserMove,
  laserUp,
  laserCancel,
  drawLaserOverlay,
} from "@/canvas/interactions/laser";
import type { AnyBoardObject } from "@/board/types";
import type {
  InputCtx,
  InteractionController,
  OverlayKit,
} from "@/canvas/interactions/types";

/** A drag that translates the whole current selection (objects + strokes). */
interface Moving {
  pid: number;
  /** Last pointer position in world coords; deltas are applied incrementally. */
  lwx: number;
  lwy: number;
  /** Pointer-down position in world coords (grid-snap reference). */
  swx: number;
  swy: number;
  /** The pressed item's origin at drag start: grid snapping aligns THIS point
   *  to the grid, so the grabbed shape lands on the lines, whatever the
   *  selection around it. */
  ax: number;
  ay: number;
  /** How to re-read the anchor's current origin from the live board. */
  anchor: { kind: HitKind; id: string };
  moved: boolean;
  /**
   * If the pressed item was already part of a multi-selection (plain click),
   * this records it so a click WITHOUT a drag collapses the selection to just
   * that item (its group) on release (Figma-style). Null otherwise.
   */
  collapse: { kind: HitKind; id: string } | null;
}

/** A drag on a resize handle of the single selected canvas object. */
interface Resizing {
  pid: number;
  id: string;
  handle: ResizeHandle;
  /** The object's box at drag start; the new box is derived from it. */
  ox: number;
  oy: number;
  ow: number;
  oh: number;
  /** True once the box actually changed (gates the single history push). */
  moved: boolean;
}

/** A drag on one vertex handle of the single selected parametric object. */
interface VertexDrag {
  pid: number;
  id: string;
  index: number;
  moved: boolean;
}

/** A drag on a FOCUSED vertex's Bézier arm (curve tangent handles). */
interface ArmDrag {
  pid: number;
  id: string;
  index: number;
  side: 1 | -1;
  moved: boolean;
}

/**
 * The vertex whose Bézier arms are showing: set by clicking a vertex handle,
 * cleared by pressing anywhere that isn't one of its handles/arms. Only
 * meaningful while its object is still the single selected vertex object.
 */
let focusedVertex: { id: string; index: number } | null = null;

/** A drag on the ROTATE handle of the single selected rotatable object. All
 *  patches are derived from the object as it was at drag START (`base`), so
 *  the accumulated turn never drifts. */
interface Rotating {
  pid: number;
  id: string;
  /** Box centre at drag start (world). */
  cx: number;
  cy: number;
  /** Pointer angle at drag start (radians). */
  startAng: number;
  base: AnyBoardObject;
  moved: boolean;
}

/** A rubber-band area ("lasso") selection drag, in world coords. */
interface Lasso {
  pid: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Shift-drag adds to the existing selection instead of replacing it. */
  add: boolean;
}

let moving: Moving | null = null;
let resizing: Resizing | null = null;
let vertexDrag: VertexDrag | null = null;
let armDrag: ArmDrag | null = null;
let rotating: Rotating | null = null;
let lasso: Lasso | null = null;

type BoardState = ReturnType<InputCtx["store"]["getState"]>;

/** Grid snapping applies on squared paper with the toggle on; holding Shift
 *  temporarily FLIPS the toggle for the gesture; Alt bypasses outright. */
const snapping = (
  st: BoardState,
  e: { altKey: boolean; shiftKey: boolean },
): boolean =>
  st.snap !== e.shiftKey && st.board.background === "squared" && !e.altKey;

/** How far (screen px) the rotate handle floats above the selection box. */
const ROTATE_OFFSET = 26;

/**
 * The single selected object whose tool exposes vertex handles, with the
 * capability itself. Mirrors singleResizableObject's gating.
 */
function singleVertexObject(
  st: BoardState,
): { obj: AnyBoardObject; cap: VertexCapability<never> } | null {
  const o = singleResizableObject(st.board.objects, st.selection);
  if (!o) return null;
  const t = getTool(o.type);
  const cap = t && t.kind === "canvas" ? t.vertices : undefined;
  return cap ? { obj: o, cap: cap as VertexCapability<never> } : null;
}

/** Index of the vertex handle within slop of the screen point, or -1. */
function hitVertexHandle(
  st: BoardState,
  obj: AnyBoardObject,
  cap: VertexCapability<never>,
  sx: number,
  sy: number,
): number {
  const pts = cap.get(obj as never);
  for (let i = 0; i < pts.length; i++) {
    const s = worldToScreen(st.camera, pts[i].x, pts[i].y);
    if (Math.abs(s.x - sx) <= HANDLE_SLOP && Math.abs(s.y - sy) <= HANDLE_SLOP) {
      return i;
    }
  }
  return -1;
}

/** The focused vertex's arm handle within slop of the screen point, or null.
 *  (Arms only exist while a vertex is focused and its tool exposes them.) */
function hitArmHandle(
  st: BoardState,
  obj: AnyBoardObject,
  cap: VertexCapability<never>,
  sx: number,
  sy: number,
): { index: number; side: 1 | -1 } | null {
  if (!focusedVertex || focusedVertex.id !== obj.id || !cap.arms) return null;
  for (const arm of cap.arms(obj as never, focusedVertex.index)) {
    const s = worldToScreen(st.camera, arm.x, arm.y);
    if (Math.abs(s.x - sx) <= HANDLE_SLOP && Math.abs(s.y - sy) <= HANDLE_SLOP) {
      return { index: focusedVertex.index, side: arm.side };
    }
  }
  return null;
}

/** Index of the "add a point" midpoint handle within slop, or -1. */
function hitMidpointHandle(
  st: BoardState,
  obj: AnyBoardObject,
  cap: VertexCapability<never>,
  sx: number,
  sy: number,
): number {
  const pts = cap.midpoints?.(obj as never) ?? [];
  for (let i = 0; i < pts.length; i++) {
    const s = worldToScreen(st.camera, pts[i].x, pts[i].y);
    if (Math.abs(s.x - sx) <= HANDLE_SLOP && Math.abs(s.y - sy) <= HANDLE_SLOP) {
      return i;
    }
  }
  return -1;
}

/** The single selected canvas object whose tool supports rotation. */
function singleRotatableObject(st: BoardState): AnyBoardObject | null {
  const o = singleResizableObject(st.board.objects, st.selection);
  if (!o) return null;
  const t = getTool(o.type);
  return t && t.kind === "canvas" && t.rotate ? o : null;
}

/** World position of the rotate handle: floats below the box's bottom centre
 *  at a constant screen offset (the top edge belongs to the float buttons). */
function rotateHandlePos(
  st: BoardState,
  o: AnyBoardObject,
): { x: number; y: number } {
  const pad = 8 / st.camera.scale;
  return {
    x: o.x + o.w / 2,
    y: o.y + o.h + pad + ROTATE_OFFSET / st.camera.scale,
  };
}

function hitRotateHandle(
  st: BoardState,
  o: AnyBoardObject,
  sx: number,
  sy: number,
): boolean {
  const p = rotateHandlePos(st, o);
  const s = worldToScreen(st.camera, p.x, p.y);
  return Math.abs(s.x - sx) <= HANDLE_SLOP && Math.abs(s.y - sy) <= HANDLE_SLOP;
}

/** Box resize handles apply unless the tool's vertices replace them. */
function boxResizable(st: BoardState): AnyBoardObject | null {
  const o = singleResizableObject(st.board.objects, st.selection);
  if (!o) return null;
  const vt = singleVertexObject(st);
  if (vt && vt.cap.replacesResize?.(vt.obj as never)) return null;
  return o;
}

/** The world origin snapping aligns to the grid for a moved item. */
function anchorOrigin(
  st: BoardState,
  anchor: { kind: HitKind; id: string },
): { x: number; y: number } | null {
  if (anchor.kind === "object") {
    const o = st.board.objects.find((x) => x.id === anchor.id);
    return o ? { x: o.x, y: o.y } : null;
  }
  const s = st.board.strokes.find((x) => x.id === anchor.id);
  if (!s) return null;
  const b = strokeBounds(s);
  return { x: b.x, y: b.y };
}

/**
 * Double-click edit, shared with the pan controller. EDITING AN OBJECT MEANS
 * EDITING IT WITH ITS OWN TOOL: switch to the tool that draws this kind and
 * keep the object selected, so the options pill styles it live (rather than the
 * select tool carrying a styling panel). Free text / maths also re-open their
 * in-place overlay editor; a pencil stroke edits in the freehand pen tool.
 * Widget/canvas tools with a settings dialog (numberline, clock, ...) have no
 * drawing tool of their own, so they still route to that dialog.
 */
export function editObjectAt(e: MouseEvent, c: InputCtx): void {
  const st = c.store.getState();
  const pp = c.evPos(e);
  const w = c.toWorld(pp.x, pp.y);

  // Strokes sit above objects on the ink layer (as in single-click selection),
  // so a double-click on a pencil stroke wins: edit it in the freehand pen tool.
  const stroke = hitTestStroke(st.board.strokes, w.x, w.y);
  if (stroke) {
    st.setSelection({ objectIds: [], strokeIds: [stroke.id] });
    // Edit it with the tool that drew it: a highlighter stroke in highlighter
    // mode, an ordinary pencil stroke in freehand — so the pill styles it live.
    st.setDrawMode(stroke.mode === "highlighter" ? "highlighter" : "free");
    st.setTool("pen");
    st.setDrawEditMode(true); // double-click again (anywhere) to exit
    return;
  }

  const hit = hitTest(st.board.objects, w.x, w.y);
  if (!hit) return;
  st.select(hit.id);
  if (hit.type === "text") {
    st.setTool("text");
    c.editor.open(hit, false);
  } else if (hit.type === "mathtext") {
    st.setTool("math");
    c.mathEditor.open(hit, false);
  } else if (hit.type === "shape") {
    // Match the draw mode to the shape's kind so the pill shows the right
    // controls (fill for closed shapes, sides for polygons, ...).
    st.setDrawMode(hit.kind as DrawMode);
    st.setTool("pen");
    st.setDrawEditMode(true); // double-click again (anywhere) to exit
  } else {
    c.editObject(hit);
  }
}

/**
 * The dashed selection frame around every selected object and stroke. Shared:
 * the select controller draws it, the DRAW / TEXT / MATH controllers reuse it so
 * a selected object reads as editable in its own tool too — a freshly committed
 * shape, or a text/maths object that's selected but not being edited. The object
 * currently OPEN in an in-place editor (`editingId`) is skipped: its textarea /
 * math field is the visual, so a frame around the hidden object would be noise.
 */
export function drawSelectionOutlines(
  kit: OverlayKit,
  st: Pick<BoardState, "board" | "selection" | "editingId">,
): void {
  const { camera, theme } = kit;
  const tctx = kit.back;
  const pad = 8 / camera.scale;
  tctx.save();
  tctx.strokeStyle = theme.accent;
  tctx.lineWidth = 2 / camera.scale;
  tctx.setLineDash([8 / camera.scale, 6 / camera.scale]);
  for (const sid of st.selection.objectIds) {
    if (sid === st.editingId) continue; // its editor overlay is the visual
    const o = st.board.objects.find((x) => x.id === sid);
    if (o) tctx.strokeRect(o.x - pad, o.y - pad, o.w + pad * 2, o.h + pad * 2);
  }
  for (const sid of st.selection.strokeIds) {
    const s = st.board.strokes.find((x) => x.id === sid);
    if (s) {
      const b = strokeBounds(s);
      tctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
    }
  }
  tctx.restore();
}

export const selectController: InteractionController = {
  tool: "select",
  cursor: "default",

  // Hover feedback: a move cursor over vertex handles, a resize cursor over
  // the selected object's box handles. In laser mode the whole tool is an
  // aiming pointer, so the cursor is a crosshair everywhere.
  hoverCursor(e, c) {
    const st = c.store.getState();
    if (st.laserMode) return "crosshair";
    const pp = c.evPos(e);
    const vt = singleVertexObject(st);
    if (vt && hitArmHandle(st, vt.obj, vt.cap, pp.x, pp.y)) {
      return "move";
    }
    if (vt && hitVertexHandle(st, vt.obj, vt.cap, pp.x, pp.y) >= 0) {
      return "move";
    }
    if (vt && hitMidpointHandle(st, vt.obj, vt.cap, pp.x, pp.y) >= 0) {
      return "copy";
    }
    const rot = singleRotatableObject(st);
    if (rot && hitRotateHandle(st, rot, pp.x, pp.y)) {
      return "grab";
    }
    const rz = boxResizable(st);
    const h = rz
      ? hitTestHandle(
          st.camera,
          rz,
          pp.x,
          pp.y,
          8 / st.camera.scale,
          HANDLE_SLOP,
        )
      : null;
    return h ? RESIZE_CURSOR[h] : null;
  },

  onPointerDown(e, c) {
    const st = c.store.getState();
    // Laser mode replaces every selection gesture with the pointer laser.
    if (st.laserMode) return laserDown(e, c);
    const { camera } = st;
    const pp = c.evPos(e);
    const w = c.toWorld(pp.x, pp.y);

    // A press on a vertex handle of the single selected parametric object
    // starts a vertex drag — the finest control wins over everything. The
    // pressed vertex becomes FOCUSED: its Bézier arms (if the tool has any)
    // show, and a press on one of those arms drags the tangent instead.
    const vt = singleVertexObject(st);
    if (vt) {
      const arm = hitArmHandle(st, vt.obj, vt.cap, pp.x, pp.y);
      if (arm && vt.cap.moveArm) {
        armDrag = {
          pid: e.pointerId,
          id: vt.obj.id,
          index: arm.index,
          side: arm.side,
          moved: false,
        };
        return;
      }
      const idx = hitVertexHandle(st, vt.obj, vt.cap, pp.x, pp.y);
      if (idx >= 0) {
        focusedVertex = { id: vt.obj.id, index: idx };
        vertexDrag = { pid: e.pointerId, id: vt.obj.id, index: idx, moved: false };
        c.render(); // the focus ring / arms appear immediately
        return;
      }
      // A press on a midpoint "+" handle INSERTS a vertex there and drags it
      // straight away (one undoable step for insert + drag together).
      const mid = hitMidpointHandle(st, vt.obj, vt.cap, pp.x, pp.y);
      if (mid >= 0 && vt.cap.insert) {
        const at = vt.cap.midpoints!(vt.obj as never)[mid];
        const ins = vt.cap.insert(vt.obj as never, mid, at.x, at.y);
        if (ins) {
          st.pushHistory();
          st.dragObject(vt.obj.id, ins.patch);
          focusedVertex = { id: vt.obj.id, index: ins.index };
          vertexDrag = {
            pid: e.pointerId,
            id: vt.obj.id,
            index: ins.index,
            moved: true, // history already marked above
          };
          return;
        }
      }
    }

    // Any press past the handles drops the focused vertex (its arms hide).
    focusedVertex = null;

    // A press on the rotate handle starts a rotation drag.
    const rotObj = singleRotatableObject(st);
    if (rotObj && hitRotateHandle(st, rotObj, pp.x, pp.y)) {
      rotating = {
        pid: e.pointerId,
        id: rotObj.id,
        cx: rotObj.x + rotObj.w / 2,
        cy: rotObj.y + rotObj.h / 2,
        startAng: Math.atan2(
          w.y - (rotObj.y + rotObj.h / 2),
          w.x - (rotObj.x + rotObj.w / 2),
        ),
        base: structuredClone(rotObj),
        moved: false,
      };
      return;
    }

    // A press on a resize handle of the single selected canvas object starts
    // a resize and wins over move / lasso.
    const rz = boxResizable(st);
    if (rz) {
      const handle = hitTestHandle(
        camera,
        rz,
        pp.x,
        pp.y,
        8 / camera.scale,
        HANDLE_SLOP,
      );
      if (handle) {
        resizing = {
          pid: e.pointerId,
          id: rz.id,
          handle,
          ox: rz.x,
          oy: rz.y,
          ow: rz.w,
          oh: rz.h,
          moved: false,
        };
        return;
      }
    }

    // Strokes ("arcs") sit visually above objects on the ink layer, so a
    // click on a stroke line wins; otherwise fall back to object boxes.
    const stroke = hitTestStroke(st.board.strokes, w.x, w.y);
    const obj = stroke ? null : hitTest(st.board.objects, w.x, w.y);
    const shift = e.shiftKey;
    if (stroke || obj) {
      const kind: HitKind = stroke ? "stroke" : "object";
      const hitId = stroke ? stroke.id : obj!.id;
      // THE shared press rule (groups, shift-toggle, collapse intent) lives in
      // board/selection.ts — the widget overlay applies the same one.
      const press = pressSelection(st.board, st.selection, kind, hitId, shift);
      if (press.selection !== st.selection) st.setSelection(press.selection);
      if (!shift) {
        // Shift only toggles membership; it never starts a move (the item may
        // have just been removed from the selection).
        const origin = anchorOrigin(st, { kind, id: hitId })!;
        moving = {
          pid: e.pointerId,
          lwx: w.x,
          lwy: w.y,
          swx: w.x,
          swy: w.y,
          ax: origin.x,
          ay: origin.y,
          anchor: { kind, id: hitId },
          moved: false,
          collapse: press.collapse,
        };
      }
    } else {
      // Empty space: begin a rubber-band area selection. Shift keeps the
      // current selection and adds to it. (Pan via the Pan tool / 2 fingers.)
      if (!shift) st.clearSelection();
      lasso = {
        pid: e.pointerId,
        x0: w.x,
        y0: w.y,
        x1: w.x,
        y1: w.y,
        add: shift,
      };
    }
    c.render();
  },

  onPointerMove(e, c) {
    const st = c.store.getState();
    if (st.laserMode) return laserMove(e, c);
    if (armDrag && e.pointerId === armDrag.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      const obj = st.board.objects.find((o) => o.id === armDrag!.id);
      const t = obj && getTool(obj.type);
      const cap =
        t && t.kind === "canvas"
          ? (t.vertices as VertexCapability<never> | undefined)
          : undefined;
      if (!obj || !cap?.moveArm) return;
      if (!armDrag.moved) {
        st.pushHistory(); // one undo step per arm drag
        armDrag.moved = true;
      }
      st.dragObject(
        obj.id,
        cap.moveArm(obj as never, armDrag.index, armDrag.side, w.x, w.y),
      );
    } else if (vertexDrag && e.pointerId === vertexDrag.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      const obj = st.board.objects.find((o) => o.id === vertexDrag!.id);
      const vt = obj && getTool(obj.type);
      const cap =
        vt && vt.kind === "canvas"
          ? (vt.vertices as VertexCapability<never> | undefined)
          : undefined;
      if (!obj || !cap) return;
      const cur = cap.get(obj as never)[vertexDrag.index];
      if (!cur || (cur.x === w.x && cur.y === w.y)) return;
      if (!vertexDrag.moved) {
        st.pushHistory(); // one undo step per vertex drag
        vertexDrag.moved = true;
      }
      // The tool applies its own magnetic snapping (right angles, grid) from
      // these intents; Alt bypasses both.
      st.dragObject(
        obj.id,
        cap.move(obj as never, vertexDrag.index, w.x, w.y, {
          gridSnap: snapping(st, e),
          angleSnap: !e.altKey,
        }),
      );
    } else if (rotating && e.pointerId === rotating.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      const obj = st.board.objects.find((o) => o.id === rotating!.id);
      const t = obj && getTool(obj.type);
      if (!obj || !t || t.kind !== "canvas" || !t.rotate) return;
      const ang = Math.atan2(w.y - rotating.cy, w.x - rotating.cx);
      let delta = ((ang - rotating.startAng) * 180) / Math.PI;
      delta = ((delta % 360) + 360) % 360;
      // Magnetic 15° multiples (stronger on 90°), else whole degrees; Alt
      // keeps it free (still whole degrees — fractional turn reads as noise).
      delta = (!e.altKey && niceAngleTarget(delta)) || Math.round(delta);
      if (!rotating.moved) {
        st.pushHistory(); // one undo step per rotation drag
        rotating.moved = true;
      }
      st.dragObject(obj.id, t.rotate(rotating.base as never, delta));
    } else if (resizing && e.pointerId === resizing.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      // Snap the dragged handle to the grid like moves and vertex drags do;
      // resizeRect then derives the other axis from the locked aspect ratio.
      const p = snapping(st, e) ? snapPt(w) : w;
      const rect = resizeRect(
        { x: resizing.ox, y: resizing.oy, w: resizing.ow, h: resizing.oh },
        resizing.handle,
        p.x,
        p.y,
      );
      const cur = st.board.objects.find((o) => o.id === resizing!.id);
      if (
        cur &&
        (cur.x !== rect.x ||
          cur.y !== rect.y ||
          cur.w !== rect.w ||
          cur.h !== rect.h)
      ) {
        if (!resizing.moved) {
          st.pushHistory(); // one undo step per resize drag
          resizing.moved = true;
        }
        st.resizeObject(resizing.id, rect); // store change triggers the redraw
      }
    } else if (moving && e.pointerId === moving.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      let dx: number;
      let dy: number;
      // Moves snap only when the grabbed item is an OBJECT: dragging
      // handwriting (a stroke) around must never jump to the grid.
      if (snapping(st, e) && moving.anchor.kind === "object") {
        // Snap the ANCHOR's would-be origin to the grid and move the whole
        // selection by whatever delta that demands.
        const target = snapPt({
          x: moving.ax + (w.x - moving.swx),
          y: moving.ay + (w.y - moving.swy),
        });
        const cur = anchorOrigin(st, moving.anchor);
        if (!cur) return;
        dx = target.x - cur.x;
        dy = target.y - cur.y;
      } else {
        dx = w.x - moving.lwx;
        dy = w.y - moving.lwy;
      }
      if (dx !== 0 || dy !== 0) {
        if (!moving.moved) {
          st.pushHistory(); // one undo step per drag
          moving.moved = true;
        }
        st.nudgeSelection(dx, dy); // moves every selected object + stroke
      }
      moving.lwx = w.x;
      moving.lwy = w.y;
    } else if (lasso && e.pointerId === lasso.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      lasso.x1 = w.x;
      lasso.y1 = w.y;
      c.render(); // the lasso rect is controller-local preview state
    }
  },

  onPointerUp(e, c) {
    const st = c.store.getState();
    if (st.laserMode) return laserUp(e, c);
    if (vertexDrag && e.pointerId === vertexDrag.pid) {
      vertexDrag = null;
    }
    if (armDrag && e.pointerId === armDrag.pid) {
      armDrag = null;
    }
    if (rotating && e.pointerId === rotating.pid) {
      rotating = null;
    }
    if (resizing && e.pointerId === resizing.pid) {
      // History already pushed on the first move; just end the drag.
      resizing = null;
    }
    if (moving && e.pointerId === moving.pid) {
      const mv = moving;
      moving = null;
      // A plain click (no drag) on an item that was part of a multi-select
      // narrows the selection to just that item (or its whole group).
      if (!mv.moved && mv.collapse) {
        st.setSelection(
          groupMembers(st.board, mv.collapse.kind, mv.collapse.id),
        );
      }
    }
    if (lasso && e.pointerId === lasso.pid) {
      const lr = lasso;
      lasso = null;
      const rect = normRect(lr.x0, lr.y0, lr.x1, lr.y1);
      // A near-zero drag is a click on empty space, not an area select --
      // the selection was already cleared on pointerdown (unless shift).
      // Gate on the drag's screen-space distance so a thin strip (wide but
      // short, or tall but narrow) still counts as a real lasso.
      const dragPx = Math.hypot(rect.w, rect.h) * st.camera.scale;
      if (dragPx >= 4) {
        const base = lr.add ? st.selection : { objectIds: [], strokeIds: [] };
        const objIds = new Set(base.objectIds);
        const strkIds = new Set(base.strokeIds);
        for (const o of st.board.objects) {
          if (objectInRect(o, rect)) objIds.add(o.id);
        }
        for (const s of st.board.strokes) {
          if (s.mode === "eraser") continue;
          if (strokeInRect(s, rect)) strkIds.add(s.id);
        }
        // Touching any member of a group lassos the whole group.
        st.setSelection(
          expandToGroups(
            { objectIds: [...objIds], strokeIds: [...strkIds] },
            st.board,
          ),
        );
      }
      c.render(); // clear the lasso rect even when the selection is unchanged
    }
  },

  cancel(c) {
    moving = null;
    resizing = null;
    vertexDrag = null;
    armDrag = null;
    rotating = null;
    laserCancel(c); // no-op unless a laser gesture is live
    if (lasso) {
      lasso = null;
      c.render();
    }
  },

  onDoubleClick(e, c) {
    // Double-click on a vertex handle REMOVES that point; double-click on
    // the drawn LINE of a curve ADDS one right there (CAD-style). Anywhere
    // else it is the usual edit-in-place / settings-dialog route.
    const st = c.store.getState();
    const pp = c.evPos(e);
    const vt = singleVertexObject(st);
    if (vt) {
      if (vt.cap.remove) {
        const idx = hitVertexHandle(st, vt.obj, vt.cap, pp.x, pp.y);
        if (idx >= 0) {
          const patch = vt.cap.remove(vt.obj as never, idx);
          if (patch) {
            if (focusedVertex?.id === vt.obj.id) focusedVertex = null;
            st.updateObject(vt.obj.id, patch);
          }
          return;
        }
      }
      if (vt.cap.insertOnPath) {
        const w = c.toWorld(pp.x, pp.y);
        const ins = vt.cap.insertOnPath(
          vt.obj as never,
          w.x,
          w.y,
          HANDLE_SLOP / st.camera.scale,
        );
        if (ins) {
          st.updateObject(vt.obj.id, ins.patch);
          focusedVertex = { id: vt.obj.id, index: ins.index };
          return;
        }
      }
    }
    editObjectAt(e, c);
  },

  // Selection outlines + resize handles + vertex handles + live lasso, on the
  // template layer (under the committed ink), exactly as renderBack drew them.
  drawOverlay(kit, c) {
    const st = c.store.getState();
    // Laser mode: draw the aiming comet / framed area instead of the selection
    // chrome (the underlying selection is preserved, just hidden while aiming).
    if (st.laserMode) return drawLaserOverlay(kit);
    const { camera, theme } = kit;
    const tctx = kit.back;
    const pad = 8 / camera.scale;

    drawSelectionOutlines(kit, st);

    // Resize handles for a single selected canvas object (constant on-screen
    // size). Drawn on the same padded box as the selection outline. Skipped
    // when the tool's vertex handles replace them (lines, arrows, curves).
    const rz = boxResizable(st);
    if (rz) {
      const hs = 5 / camera.scale;
      const centers = handleCenters(rz, pad);
      tctx.save();
      tctx.fillStyle = theme.accent;
      tctx.strokeStyle = theme.paper;
      tctx.lineWidth = 1.5 / camera.scale;
      for (const hid of RESIZE_HANDLES) {
        const cc = centers[hid];
        tctx.fillRect(cc.x - hs, cc.y - hs, hs * 2, hs * 2);
        tctx.strokeRect(cc.x - hs, cc.y - hs, hs * 2, hs * 2);
      }
      tctx.restore();
    }

    // Vertex handles (parametric shapes): control-arm guides first, then a
    // round handle per vertex — visually distinct from the square box handles.
    const vt = singleVertexObject(st);
    if (vt) {
      const guides = vt.cap.guides?.(vt.obj as never) ?? [];
      if (guides.length > 0) {
        tctx.save();
        tctx.strokeStyle = theme.muted;
        tctx.lineWidth = 1.5 / camera.scale;
        tctx.setLineDash([4 / camera.scale, 4 / camera.scale]);
        tctx.beginPath();
        for (const [a, b] of guides) {
          tctx.moveTo(a.x, a.y);
          tctx.lineTo(b.x, b.y);
        }
        tctx.stroke();
        tctx.restore();
      }
      // A stale focus (object deselected, point removed) self-heals here.
      if (focusedVertex && focusedVertex.id !== vt.obj.id) focusedVertex = null;
      const pts = vt.cap.get(vt.obj as never);
      if (focusedVertex && focusedVertex.index >= pts.length) {
        focusedVertex = null;
      }
      const r = 6 / camera.scale;
      tctx.save();
      tctx.fillStyle = theme.accent;
      tctx.strokeStyle = theme.paper;
      tctx.lineWidth = 2 / camera.scale;
      for (const p of pts) {
        tctx.beginPath();
        tctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        tctx.fill();
        tctx.stroke();
      }
      // The FOCUSED vertex: a ring, plus its Bézier arms (dashed guides to
      // draggable tangent handles) when the tool exposes them.
      if (focusedVertex) {
        const fp = pts[focusedVertex.index];
        tctx.strokeStyle = theme.accent;
        tctx.lineWidth = 1.5 / camera.scale;
        tctx.beginPath();
        tctx.arc(fp.x, fp.y, r + 3 / camera.scale, 0, Math.PI * 2);
        tctx.stroke();
        const arms = vt.cap.arms?.(vt.obj as never, focusedVertex.index) ?? [];
        if (arms.length > 0) {
          tctx.strokeStyle = theme.muted;
          tctx.setLineDash([4 / camera.scale, 4 / camera.scale]);
          tctx.beginPath();
          for (const a of arms) {
            tctx.moveTo(fp.x, fp.y);
            tctx.lineTo(a.x, a.y);
          }
          tctx.stroke();
          tctx.setLineDash([]);
          const ar = 5 / camera.scale;
          tctx.fillStyle = theme.paper;
          tctx.strokeStyle = theme.muted;
          tctx.lineWidth = 2 / camera.scale;
          for (const a of arms) {
            tctx.beginPath();
            tctx.arc(a.x, a.y, ar, 0, Math.PI * 2);
            tctx.fill();
            tctx.stroke();
          }
        }
      }
      // "Add a point" handles: smaller, hollow, with a + mark — pressing one
      // inserts a vertex there (curves, polygons).
      const mids = vt.cap.midpoints?.(vt.obj as never) ?? [];
      if (mids.length > 0) {
        const mr = 5 / camera.scale;
        tctx.fillStyle = theme.paper;
        tctx.strokeStyle = theme.accent;
        tctx.lineWidth = 1.5 / camera.scale;
        for (const p of mids) {
          tctx.beginPath();
          tctx.arc(p.x, p.y, mr, 0, Math.PI * 2);
          tctx.fill();
          tctx.stroke();
          tctx.beginPath();
          tctx.moveTo(p.x - mr * 0.5, p.y);
          tctx.lineTo(p.x + mr * 0.5, p.y);
          tctx.moveTo(p.x, p.y - mr * 0.5);
          tctx.lineTo(p.x, p.y + mr * 0.5);
          tctx.stroke();
        }
      }
      tctx.restore();
    }

    // Rotate handle: a lollipop below the selection's bottom centre. Round
    // like the vertex handles but hollow, joined to the box by a short stem.
    const rot = singleRotatableObject(st);
    if (rot) {
      const p = rotateHandlePos(st, rot);
      const r = 6 / camera.scale;
      tctx.save();
      tctx.strokeStyle = theme.accent;
      tctx.lineWidth = 1.5 / camera.scale;
      tctx.setLineDash([]);
      tctx.beginPath();
      tctx.moveTo(rot.x + rot.w / 2, rot.y + rot.h + pad);
      tctx.lineTo(p.x, p.y - r);
      tctx.stroke();
      tctx.fillStyle = theme.paper;
      tctx.lineWidth = 2 / camera.scale;
      tctx.beginPath();
      tctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      tctx.fill();
      tctx.stroke();
      tctx.restore();
    }

    if (lasso) {
      const r = normRect(lasso.x0, lasso.y0, lasso.x1, lasso.y1);
      tctx.save();
      tctx.fillStyle = "rgba(242,179,61,0.12)";
      tctx.strokeStyle = theme.accent;
      tctx.lineWidth = 1.5 / camera.scale;
      tctx.setLineDash([6 / camera.scale, 4 / camera.scale]);
      tctx.fillRect(r.x, r.y, r.w, r.h);
      tctx.strokeRect(r.x, r.y, r.w, r.h);
      tctx.restore();
    }
  },
};
