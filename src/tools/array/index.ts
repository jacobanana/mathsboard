// Arrays / dots — rows × columns of dots showing the product.
//
// Ported from maths-whiteboard.html:
//   size:   objSize case 'array' (line 208)
//   draw:   drawArray (line 247)
//   dialog: arrayDialog (lines 441-448)

import { defineCanvasTool } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { ArrayDialog } from "@/tools/array/Dialog";

export interface ArrayParams {
  rows: number;
  cols: number;
}

export default defineCanvasTool<ArrayParams>({
  kind: "canvas",
  type: "array",
  name: "Arrays / dots",
  blurb: "see the product",
  category: "number",
  answer: true,

  defaults: () => ({ rows: 3, cols: 5 }),

  size: (p) => ({ w: Math.max(p.cols * 30 + 28, 200), h: p.rows * 30 + 12 + 44 }),

  draw: ({ ctx, theme, font }, o) => {
    const g = 30;
    const r = 7;
    const x0 = o.x + 14;
    const y0 = o.y + 12;
    ctx.save();
    fillPanel(ctx, o);
    ctx.fillStyle = theme.accent;
    for (let i = 0; i < o.rows; i++)
      for (let j = 0; j < o.cols; j++) {
        ctx.beginPath();
        ctx.arc(x0 + j * g, y0 + i * g, r, 0, 2 * Math.PI);
        ctx.fill();
      }
    ctx.fillStyle = theme.lineInk;
    ctx.font = "700 18px " + font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const ly = y0 + (o.rows - 1) * g + 34;
    ctx.fillText(
      o.rows + " × " + o.cols + " = " + (o.revealed ? String(o.rows * o.cols) : "__"),
      x0,
      ly,
    );
    ctx.restore();
  },

  Dialog: ArrayDialog,
});
