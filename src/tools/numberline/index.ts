// REFERENCE TOOL (canvas + dialog). Copy this shape for any tool that places a
// canvas object configured through a modal form.
//
//   1. Declare a params type P.
//   2. defineCanvasTool({ ...meta, defaults, size, draw, Dialog }).
//   3. size(p) returns the bounding box; the host centres the object on screen.
//   4. draw(kit, obj) renders in world space (camera transform already applied).
//   5. Dialog (see ./Dialog.tsx) collects + validates params, then onSubmit(p).
//
// Ported from maths-whiteboard.html: size case (line 201), drawNumberLine
// (line 231), numberLineDialog (lines 391-402).

import { defineCanvasTool } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { fmtNum, fillPanel } from "@/canvas/drawHelpers";
import { NumberLineDialog } from "@/tools/numberline/Dialog";

export interface NumberLineParams {
  start: number;
  step: number;
  intervals: number;
  hide: boolean;
}

export const numberLineTool = defineCanvasTool<NumberLineParams>({
  kind: "canvas",
  type: "numberline",
  name: "Number line",
  blurb: "count · round · jumps",
  category: "number",

  defaults: () => ({ start: 0, step: 1, intervals: 10, hide: false }),

  size: (p) => ({ w: clamp(p.intervals * 54, 260, 1000), h: 64 }),

  draw: ({ ctx, theme, font }, o) => {
    const pad = 16;
    const lineY = o.y + 22;
    const x0 = o.x + pad;
    const x1 = o.x + o.w - pad;
    const span = x1 - x0;
    ctx.save();
    fillPanel(ctx, o);
    ctx.strokeStyle = theme.lineInk;
    ctx.fillStyle = theme.lineInk;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, lineY);
    ctx.lineTo(x1, lineY);
    ctx.stroke();
    // End arrowheads.
    (
      [
        [x0, -1],
        [x1, 1],
      ] as [number, number][]
    ).forEach(([ex, d]) => {
      ctx.beginPath();
      ctx.moveTo(ex, lineY);
      ctx.lineTo(ex - d * 11, lineY - 6);
      ctx.moveTo(ex, lineY);
      ctx.lineTo(ex - d * 11, lineY + 6);
      ctx.stroke();
    });
    ctx.font = "600 16px " + font;
    ctx.textAlign = "center";
    for (let i = 0; i <= o.intervals; i++) {
      const x = x0 + span * (i / o.intervals);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, lineY - 9);
      ctx.lineTo(x, lineY + 9);
      ctx.stroke();
      if (!o.hide) ctx.fillText(fmtNum(o.start + i * o.step), x, lineY + 28);
    }
    ctx.restore();
  },

  Dialog: NumberLineDialog,
});
