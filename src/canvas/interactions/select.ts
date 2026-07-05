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
  isInSelection,
  subtractSelection,
  unionSelection,
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
import type { AnyBoardObject } from "@/board/types";
import type {
  InputCtx,
  InteractionController,
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
let lasso: Lasso | null = null;

type BoardState = ReturnType<InputCtx["store"]["getState"]>;

/** Grid snapping applies on squared paper with the toggle on; Alt bypasses. */
const snapping = (st: BoardState, e: { altKey: boolean }): boolean =>
  st.snap && st.board.background === "squared" && !e.altKey;

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
 * Double-click edit, shared with the pan controller: select the hit object,
 * then edit free text / maths notation in place or route everything else to
 * the host's settings-dialog flow.
 */
export function editObjectAt(e: MouseEvent, c: InputCtx): void {
  const st = c.store.getState();
  const pp = c.evPos(e);
  const w = c.toWorld(pp.x, pp.y);
  const hit = hitTest(st.board.objects, w.x, w.y);
  if (!hit) return;
  st.select(hit.id);
  if (hit.type === "text") c.editor.open(hit, false);
  else if (hit.type === "mathtext") c.mathEditor.open(hit, false);
  else c.editObject(hit);
}

export const selectController: InteractionController = {
  tool: "select",
  cursor: "default",

  // Hover feedback: a move cursor over vertex handles, a resize cursor over
  // the selected object's box handles.
  hoverCursor(e, c) {
    const st = c.store.getState();
    const pp = c.evPos(e);
    const vt = singleVertexObject(st);
    if (vt && hitVertexHandle(st, vt.obj, vt.cap, pp.x, pp.y) >= 0) {
      return "move";
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
    const { camera } = st;
    const pp = c.evPos(e);
    const w = c.toWorld(pp.x, pp.y);

    // A press on a vertex handle of the single selected parametric object
    // starts a vertex drag — the finest control wins over everything.
    const vt = singleVertexObject(st);
    if (vt) {
      const idx = hitVertexHandle(st, vt.obj, vt.cap, pp.x, pp.y);
      if (idx >= 0) {
        vertexDrag = { pid: e.pointerId, id: vt.obj.id, index: idx, moved: false };
        return;
      }
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
      const sel = st.selection;
      // A grouped item stands for its whole group (board/selection.ts).
      const members = groupMembers(st.board, kind, hitId);
      if (shift) {
        // Toggle membership (whole group at once); do not start a move (the
        // item may have just been removed from the selection).
        st.setSelection(
          isInSelection(sel, kind, hitId)
            ? subtractSelection(sel, members)
            : unionSelection(sel, members),
        );
      } else {
        const inSel = isInSelection(sel, kind, hitId);
        const wasMulti = sel.objectIds.length + sel.strokeIds.length > 1;
        const wasGroupOnly =
          members.objectIds.length + members.strokeIds.length > 1;
        if (!inSel) st.setSelection(members);
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
          // Click (no drag) on one of many -> collapse to it (its group) on
          // release — but not when the "many" IS just the pressed group.
          collapse: inSel && wasMulti && !(wasGroupOnly && !shift)
            ? { kind, id: hitId }
            : null,
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
    if (vertexDrag && e.pointerId === vertexDrag.pid) {
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
    } else if (resizing && e.pointerId === resizing.pid) {
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      const rect = resizeRect(
        { x: resizing.ox, y: resizing.oy, w: resizing.ow, h: resizing.oh },
        resizing.handle,
        w.x,
        w.y,
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
    if (vertexDrag && e.pointerId === vertexDrag.pid) {
      vertexDrag = null;
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
    if (lasso) {
      lasso = null;
      c.render();
    }
  },

  onDoubleClick: editObjectAt,

  // Selection outlines + resize handles + vertex handles + live lasso, on the
  // template layer (under the committed ink), exactly as renderBack drew them.
  drawOverlay(kit, c) {
    const st = c.store.getState();
    const { board, selection } = st;
    const { camera, theme } = kit;
    const tctx = kit.back;
    const pad = 8 / camera.scale;

    tctx.save();
    tctx.strokeStyle = theme.accent;
    tctx.lineWidth = 2 / camera.scale;
    tctx.setLineDash([8 / camera.scale, 6 / camera.scale]);
    for (const sid of selection.objectIds) {
      const o = board.objects.find((x) => x.id === sid);
      if (o) tctx.strokeRect(o.x - pad, o.y - pad, o.w + pad * 2, o.h + pad * 2);
    }
    for (const sid of selection.strokeIds) {
      const s = board.strokes.find((x) => x.id === sid);
      if (s) {
        const b = strokeBounds(s);
        tctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
      }
    }
    tctx.restore();

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
      const pts = vt.cap.get(vt.obj as never);
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
