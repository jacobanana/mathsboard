// The pan interaction controller: drag the camera. Double-click still edits
// the object under the pointer (shared with the select controller), matching
// the original canvas behaviour.

import { editObjectAt } from "@/canvas/interactions/select";
import type { InteractionController } from "@/canvas/interactions/types";

interface Panning {
  pid: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}

let panning: Panning | null = null;

export const panController: InteractionController = {
  tool: "pan",
  cursor: "grab",

  onPointerDown(e, c) {
    const cam = c.camera();
    const pp = c.evPos(e);
    panning = { pid: e.pointerId, sx: pp.x, sy: pp.y, cx: cam.x, cy: cam.y };
    c.canvas.style.cursor = "grabbing";
  },

  onPointerMove(e, c) {
    if (!panning || e.pointerId !== panning.pid) return;
    const pp = c.evPos(e);
    c.store.getState().setCamera({
      x: panning.cx + (pp.x - panning.sx),
      y: panning.cy + (pp.y - panning.sy),
    });
  },

  onPointerUp(e, c) {
    if (!panning || e.pointerId !== panning.pid) return;
    panning = null;
    if (c.store.getState().tool === "pan") c.canvas.style.cursor = "grab";
  },

  cancel() {
    panning = null;
  },

  onDoubleClick: editObjectAt,
};
