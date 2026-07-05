// CanvasTool (canvas + dialog): the Fraction wall.
//
// A stack of rows, each row split into d equal unit fractions (1, 1/2, 1/3, …)
// down to a chosen denominator (6/8/10/12). Extracted from the Fractions tool's
// former "wall" mode so it stands on its own in the gallery.
//
// draw ported verbatim from maths-whiteboard.html drawFractionWall (line 234):
// mechanical transforms only (tctx -> kit.ctx, css('--line-ink') -> theme.lineInk,
// FONT -> kit.font); all numeric constants, offsets and branches kept identical.

import { defineCanvasTool } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { FractionWallDialog } from "@/tools/fractionwall/Dialog";

export interface FractionWallParams {
  max: number;
}

export const fractionWallTool = defineCanvasTool<FractionWallParams>({
  kind: "canvas",
  type: "fractionwall",
  name: "Fraction wall",
  blurb: "halves … twelfths",
  category: "fractions",

  defaults: () => ({ max: 8 }),

  size: (p) => ({ w: 480, h: p.max * 34 }),

  draw: ({ ctx, theme, font }, o) => {
    const w = o.w,
      rowH = 34;
    const max = o.max;
    ctx.save();
    fillPanel(ctx, o);
    ctx.font = "600 14px " + font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (let d = 1; d <= max; d++) {
      const y = o.y + (d - 1) * rowH,
        cw = w / d;
      for (let k = 0; k < d; k++) {
        const cx = o.x + k * cw;
        ctx.fillStyle = d % 2 === 0 ? "#F4EFE0" : "#FCFAF4";
        ctx.fillRect(cx, y, cw, rowH);
        ctx.strokeStyle = theme.lineInk;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(cx, y, cw, rowH);
        ctx.fillStyle = theme.lineInk;
        const label = d === 1 ? "1" : "1/" + d;
        if (cw > 26) ctx.fillText(label, cx + cw / 2, y + rowH / 2);
      }
    }
    ctx.restore();
  },

  Dialog: FractionWallDialog,
});

export default fractionWallTool;
