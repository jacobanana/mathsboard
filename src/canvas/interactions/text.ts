// The text interaction controller. Two gestures:
//
//   TAP        — re-open an existing text object in the in-place editor, or
//                create a fresh AUTO-sizing text object at the point (the box
//                hugs the text as you type). The original behaviour.
//   CLICK-DRAG — rubber-band a rectangle: create a fixed-width TEXT BOX whose
//                width is the dragged width. Text wraps to it; the height grows
//                with the content (the drag height is only the intent hint).
//
// Both are DEFERRED to pointerup so a SECOND finger can cancel the gesture into
// a pinch/pan instead — the text tool used to open the editor on pointerdown,
// which the incoming second finger then committed-and-swallowed, so text was the
// one tool that could never two-finger zoom.

import { hitTest } from "@/board/geometry";
import { textSizeOf } from "@/canvas/drawHelpers";
import { id as newId } from "@/board/types";
import type { AnyBoardObject } from "@/board/types";
import { createObject } from "@/board/commands";
import { drawSelectionOutlines } from "@/canvas/interactions/select";
import type {
  InputCtx,
  InteractionController,
  Pt,
} from "@/canvas/interactions/types";

/** Screen-px movement past which a press is a drag (a text box) not a tap. */
const DRAG_PX = 8;
/** Smallest wrap width (world px) a dragged box may have — a near-vertical drag
 *  still yields a usable box, not a one-character-per-line sliver. */
const MIN_BOX_W = 48;

/** A press awaiting pointerup. `edit` is an existing text object under the press
 *  (re-opened on a tap); `cur` is the live drag point once past the threshold
 *  (null = still a tap). */
interface Pending {
  pid: number;
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  edit: AnyBoardObject | null;
  cur: Pt | null;
}

let pending: Pending | null = null;

const isDrag = (p: Pending): boolean => p.cur != null;

/** Create + open a fresh text object via the shared creation ritual: selected
 *  (its frame reads as live), text tool kept, tracking deferred to the
 *  editor's first non-empty commit (an abandoned empty never counts). */
function createAndEdit(c: InputCtx, obj: AnyBoardObject): void {
  createObject(obj, { keepTool: true, deferTracking: true });
  c.editor.open(obj, true);
}

export const textController: InteractionController = {
  tool: "text",
  cursor: "text",

  onPointerDown(e, c) {
    const st = c.store.getState();
    const pp = c.evPos(e);
    const w = c.toWorld(pp.x, pp.y);
    const hit = hitTest(st.board.objects, w.x, w.y);
    pending = {
      pid: e.pointerId,
      sx: pp.x,
      sy: pp.y,
      wx: w.x,
      wy: w.y,
      edit: hit && hit.type === "text" ? hit : null,
      cur: null,
    };
  },

  onPointerMove(e, c) {
    if (!pending || e.pointerId !== pending.pid) return;
    const pp = c.evPos(e);
    // Stay a tap until the pointer leaves the tap tolerance; then it's a box.
    if (!isDrag(pending) && Math.hypot(pp.x - pending.sx, pp.y - pending.sy) <= DRAG_PX)
      return;
    pending.cur = c.toWorld(pp.x, pp.y);
    c.render();
  },

  onPointerUp(e, c) {
    if (!pending || e.pointerId !== pending.pid) return;
    const pt = pending;
    pending = null;
    // pointercancel = the system took over (scroll/palm); drop the gesture.
    if (e.type === "pointercancel") {
      c.render();
      return;
    }
    const st = c.store.getState();
    const size = st.textSize;
    const align = st.textAlign;

    if (isDrag(pt)) {
      // A fixed-width text box: anchor at the rect's top-left, wrap to its width.
      const x = Math.min(pt.wx, pt.cur!.x);
      const y = Math.min(pt.wy, pt.cur!.y);
      const boxW = Math.max(Math.abs(pt.cur!.x - pt.wx), MIN_BOX_W);
      const sz = textSizeOf("", size, boxW);
      createAndEdit(c, {
        id: newId(),
        type: "text",
        x,
        y,
        w: sz.w,
        h: sz.h,
        text: "",
        size,
        color: st.color,
        align,
        boxW,
      });
      c.render(); // clear the drag-preview rectangle
      return;
    }

    // Tap: re-open an existing text object, or create auto-sizing text.
    if (pt.edit) {
      st.select(pt.edit.id);
      c.editor.open(pt.edit, false);
      return;
    }
    const sz = textSizeOf("", size);
    createAndEdit(c, {
      id: newId(),
      type: "text",
      x: pt.wx,
      y: pt.wy,
      w: sz.w,
      h: sz.h,
      text: "",
      size,
      color: st.color,
      align,
    });
  },

  // A selected (but not actively edited) text object reads as editable via its
  // dashed frame, like a shape in the draw tool; plus the rubber-band rectangle
  // while dragging a new text box. Both on the template (back) layer, world space.
  drawOverlay(kit, c) {
    drawSelectionOutlines(kit, c.store.getState());
    if (!pending || !isDrag(pending)) return;
    const { back, camera, theme } = kit;
    const x = Math.min(pending.wx, pending.cur!.x);
    const y = Math.min(pending.wy, pending.cur!.y);
    const w = Math.abs(pending.cur!.x - pending.wx);
    const h = Math.abs(pending.cur!.y - pending.wy);
    back.save();
    back.strokeStyle = theme.accent;
    back.lineWidth = 1.5 / camera.scale;
    back.setLineDash([6 / camera.scale, 4 / camera.scale]);
    back.strokeRect(x, y, w, h);
    back.restore();
  },

  // A deferred text-tool gesture becomes a pinch: drop it and clear the preview.
  cancel(c) {
    pending = null;
    c.render();
  },
};
