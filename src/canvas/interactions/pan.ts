// The pan interaction controller: drag the camera. Double-click still edits
// the object under the pointer (shared with the select controller), matching
// the original canvas behaviour — and that leaves the object SELECTED, so a
// plain tap on the board here clears the selection again. Without it the frame
// a pan-mode double-click puts up had no way off the screen: the pan tool
// never touches the selection and the pointer tool is a trip to the dock away.

import { selectionCount } from "@/board/store";
import { editObjectAt } from "@/canvas/interactions/select";
import type { InteractionController } from "@/canvas/interactions/types";

/** A press that never travels this far (screen px) was a tap, not a pan. */
const TAP_SLOP = 4;

interface Panning {
  pid: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  /** Did this press ever become a real drag? A tap deselects; a drag doesn't. */
  moved: boolean;
}

let panning: Panning | null = null;

export const panController: InteractionController = {
  tool: "pan",
  cursor: "grab",

  onPointerDown(e, c) {
    const cam = c.camera();
    const pp = c.evPos(e);
    panning = {
      pid: e.pointerId,
      sx: pp.x,
      sy: pp.y,
      cx: cam.x,
      cy: cam.y,
      moved: false,
    };
    c.canvas.style.cursor = "grabbing";
  },

  onPointerMove(e, c) {
    if (!panning || e.pointerId !== panning.pid) return;
    const pp = c.evPos(e);
    if (Math.abs(pp.x - panning.sx) + Math.abs(pp.y - panning.sy) > TAP_SLOP) {
      panning.moved = true;
    }
    c.store.getState().setCamera({
      x: panning.cx + (pp.x - panning.sx),
      y: panning.cy + (pp.y - panning.sy),
    });
  },

  onPointerUp(e, c) {
    if (!panning || e.pointerId !== panning.pid) return;
    const tap = !panning.moved;
    panning = null;
    const st = c.store.getState();
    if (st.tool === "pan") c.canvas.style.cursor = "grab";
    // A tap on the board dismisses whatever is selected (the double-click-to-
    // edit route is the only thing that selects in this tool). Guarded on there
    // being a selection so an idle tap never writes to the store.
    if (tap && selectionCount(st.selection) > 0) {
      st.clearSelection();
      c.render();
    }
  },

  cancel() {
    panning = null;
  },

  onDoubleClick: editObjectAt,
};
