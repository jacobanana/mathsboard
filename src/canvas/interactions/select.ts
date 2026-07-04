// The select interaction controller: press-to-select (strokes win over
// objects), shift-toggle, drag-to-move the whole selection, resize via the
// single selected object's handles, rubber-band ("lasso") area select on empty
// space, and the Figma-style collapse of a multi-select on a plain click. Its
// overlay contributes the selection outlines, resize handles and lasso rect.

import {
  hitTest,
  hitTestStroke,
  hitTestHandle,
  handleCenters,
  normRect,
  objectInRect,
  strokeBounds,
  strokeInRect,
  RESIZE_HANDLES,
} from "@/board/geometry";
import type { ResizeHandle } from "@/board/geometry";
import {
  singleSelection,
  toggleSelection,
  isInSelection,
} from "@/board/selection";
import type { HitKind } from "@/board/selection";
import {
  HANDLE_SLOP,
  RESIZE_CURSOR,
  resizeRect,
  singleResizableObject,
} from "@/board/resize";
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
  moved: boolean;
  /**
   * If the pressed item was already part of a multi-selection (plain click),
   * this records it so a click WITHOUT a drag collapses the selection to just
   * that item on release (Figma-style). Null otherwise.
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
let lasso: Lasso | null = null;

/**
 * Double-click edit, shared with the pan controller: select the hit object,
 * then edit free text in place or route everything else to the host's
 * settings-dialog flow.
 */
export function editObjectAt(e: MouseEvent, c: InputCtx): void {
  const st = c.store.getState();
  const pp = c.evPos(e);
  const w = c.toWorld(pp.x, pp.y);
  const hit = hitTest(st.board.objects, w.x, w.y);
  if (!hit) return;
  st.select(hit.id);
  if (hit.type === "text") c.editor.open(hit, false);
  else c.editObject(hit);
}

export const selectController: InteractionController = {
  tool: "select",
  cursor: "default",

  // Hover feedback: a resize cursor over the selected object's handles.
  hoverCursor(e, c) {
    const st = c.store.getState();
    const pp = c.evPos(e);
    const rz = singleResizableObject(st.board.objects, st.selection);
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

    // A press on a resize handle of the single selected canvas object starts
    // a resize and wins over move / lasso.
    const rz = singleResizableObject(st.board.objects, st.selection);
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
      if (shift) {
        // Toggle membership; do not start a move (the item may have just
        // been removed from the selection).
        st.setSelection(toggleSelection(sel, kind, hitId));
      } else {
        const inSel = isInSelection(sel, kind, hitId);
        const wasMulti = sel.objectIds.length + sel.strokeIds.length > 1;
        if (!inSel) st.setSelection(singleSelection(kind, hitId));
        moving = {
          pid: e.pointerId,
          lwx: w.x,
          lwy: w.y,
          moved: false,
          // Click (no drag) on one of many -> collapse to it on release.
          collapse: inSel && wasMulti ? { kind, id: hitId } : null,
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
    if (resizing && e.pointerId === resizing.pid) {
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
      const dx = w.x - moving.lwx;
      const dy = w.y - moving.lwy;
      if (dx !== 0 || dy !== 0) {
        if (!moving.moved) {
          st.pushHistory(); // one undo step per drag
          moving.moved = true;
        }
        st.nudgeSelection(dx, dy); // moves every selected object + stroke
        moving.lwx = w.x;
        moving.lwy = w.y;
      }
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
    if (resizing && e.pointerId === resizing.pid) {
      // History already pushed on the first move; just end the drag.
      resizing = null;
    }
    if (moving && e.pointerId === moving.pid) {
      const mv = moving;
      moving = null;
      // A plain click (no drag) on an item that was part of a multi-select
      // narrows the selection to just that item.
      if (!mv.moved && mv.collapse) {
        st.setSelection(singleSelection(mv.collapse.kind, mv.collapse.id));
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
        st.setSelection({
          objectIds: [...objIds],
          strokeIds: [...strkIds],
        });
      }
      c.render(); // clear the lasso rect even when the selection is unchanged
    }
  },

  cancel(c) {
    moving = null;
    resizing = null;
    if (lasso) {
      lasso = null;
      c.render();
    }
  },

  onDoubleClick: editObjectAt,

  // Selection outlines + resize handles + live lasso, on the template layer
  // (under the committed ink), exactly as renderBack drew them.
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
    // size). Drawn on the same padded box as the selection outline.
    const rz = singleResizableObject(board.objects, selection);
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
