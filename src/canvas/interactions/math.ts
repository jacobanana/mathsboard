// The maths interaction controller: a tap either re-opens an existing
// maths-notation object in the in-place MathLive editor or creates a fresh
// empty one and edits it. The exact shape of the text controller — including
// deferring the create/edit to pointerup so a SECOND finger can cancel the
// tap into a pinch/pan instead (see text.ts for the full story).

import { hitTest } from "@/board/geometry";
import { id as newId } from "@/board/types";
import { mathTextTool } from "@/tools/mathtext";
import { prewarmMathEditor } from "@/canvas/mathEditor";
import type { AnyBoardObject } from "@/board/types";
import type { InteractionController } from "@/canvas/interactions/types";

/** A tap awaiting pointerup. `edit` is the existing maths object to re-open,
 *  or null to place a fresh one at (wx, wy). */
interface PendingMath {
  pid: number;
  wx: number;
  wy: number;
  edit: AnyBoardObject | null;
}

let pending: PendingMath | null = null;

export const mathController: InteractionController = {
  tool: "math",
  cursor: "text",

  onPointerDown(e, c) {
    prewarmMathEditor(); // usually a no-op: BoardCanvas prewarms on tool pick
    const st = c.store.getState();
    const pp = c.evPos(e);
    const w = c.toWorld(pp.x, pp.y);
    const hit = hitTest(st.board.objects, w.x, w.y);
    pending = {
      pid: e.pointerId,
      wx: w.x,
      wy: w.y,
      edit: hit && hit.type === "mathtext" ? hit : null,
    };
  },

  onPointerMove() {
    // Nothing to preview: the tap resolves on release.
  },

  onPointerUp(e, c) {
    if (!pending || e.pointerId !== pending.pid) return;
    const pt = pending;
    pending = null;
    // pointercancel = the system took over (scroll/palm); drop the tap.
    if (e.type === "pointercancel") return;
    const st = c.store.getState();
    if (pt.edit) {
      st.select(pt.edit.id);
      c.mathEditor.open(pt.edit, false);
    } else {
      // Create a fresh, empty maths object then edit it in place. The params
      // are the tool's defaults; the real natW/natH land at editor commit.
      const params = mathTextTool.defaults();
      const sz = mathTextTool.size(params);
      const obj: AnyBoardObject = {
        id: newId(),
        type: "mathtext",
        x: pt.wx,
        y: pt.wy,
        w: sz.w,
        h: sz.h,
        ...params,
      };
      st.addObject(obj);
      st.select(obj.id);
      c.mathEditor.open(obj, true);
    }
  },

  // A deferred maths-tool tap becomes a pinch.
  cancel() {
    pending = null;
  },
};
