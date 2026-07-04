// The text interaction controller: a tap either re-opens an existing text
// object in the in-place editor or creates a fresh empty one and edits it.
//
// The create/edit is DEFERRED to pointerup so a SECOND finger can cancel it
// into a pinch/pan instead. Every other tool starts its single-pointer action
// on pointerdown and the host's two-pointer branch cancels it; the text tool
// used to open the editor immediately, which the incoming second finger then
// committed-and-swallowed -- so text was the one tool that could never
// two-finger zoom.

import { hitTest } from "@/board/geometry";
import { textSizeOf } from "@/canvas/drawHelpers";
import { id as newId } from "@/board/types";
import type { AnyBoardObject } from "@/board/types";
import type { InteractionController } from "@/canvas/interactions/types";

/** A tap awaiting pointerup. `edit` is the existing text object to re-open,
 *  or null to place a fresh box at (wx, wy). */
interface PendingText {
  pid: number;
  wx: number;
  wy: number;
  edit: AnyBoardObject | null;
}

let pending: PendingText | null = null;

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
      wx: w.x,
      wy: w.y,
      edit: hit && hit.type === "text" ? hit : null,
    };
  },

  onPointerMove() {
    // Nothing to preview: the tap resolves on release.
  },

  onPointerUp(e, c) {
    if (!pending || e.pointerId !== pending.pid) return;
    const pt = pending;
    pending = null;
    // pointercancel = the system took over (scroll/palm); drop the tap. A
    // real pointerup creates the box / re-opens the editor.
    if (e.type === "pointercancel") return;
    const st = c.store.getState();
    if (pt.edit) {
      st.select(pt.edit.id);
      c.editor.open(pt.edit, false);
    } else {
      // Create a fresh, empty text object then edit it in place.
      const size = st.textSize;
      const sz = textSizeOf("", size);
      const obj: AnyBoardObject = {
        id: newId(),
        type: "text",
        x: pt.wx,
        y: pt.wy,
        w: sz.w,
        h: sz.h,
        text: "",
        size,
        color: st.color,
      };
      st.addObject(obj);
      st.select(obj.id);
      c.editor.open(obj, true);
    }
  },

  // A deferred text-tool tap becomes a pinch.
  cancel() {
    pending = null;
  },
};
