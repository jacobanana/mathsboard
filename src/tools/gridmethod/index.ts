// CanvasTool (canvas + dialog) — the box / grid method for multiplication.
//
// Splits each factor into its place-value parts (partition) and lays them out
// as a grid: column headers from partition(a), row headers from partition(b),
// optional filled-in products.
//
// Ported from maths-whiteboard.html: objSize case 'gridmethod' (line 205),
// drawGridMethod (line 241), gridMethodDialog (lines 414-421).

import { defineCanvasTool } from "@/tools/registry";
import { partition, fillPanel } from "@/canvas/drawHelpers";
import { GridMethodDialog } from "@/tools/gridmethod/Dialog";

export interface GridMethodParams {
  a: number;
  b: number;
}

export const gridMethodTool = defineCanvasTool<GridMethodParams>({
  kind: "canvas",
  type: "gridmethod",
  name: "Multiplication grid",
  blurb: "box / grid method",
  category: "number",
  answer: true,

  defaults: () => ({ a: 34, b: 6 }),

  size: (p) => ({
    w: (partition(p.a).length + 1) * 72,
    h: (partition(p.b).length + 1) * 54,
  }),

  draw: ({ ctx, theme, font }, o) => {
    const A = partition(o.a),
      B = partition(o.b),
      cols = A.length,
      rows = B.length,
      cw = 72,
      ch = 54;
    ctx.save();
    fillPanel(ctx, o);
    ctx.font = "600 18px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++) {
        const cx = o.x + c * cw,
          cy = o.y + r * ch;
        if ((r === 0 || c === 0) && !(r === 0 && c === 0)) {
          ctx.fillStyle = theme.accentSoft;
          ctx.fillRect(cx, cy, cw, ch);
        }
        ctx.strokeStyle = "#C3D4D2";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cw, ch);
        let t = "";
        if (r === 0 && c === 0) t = "×";
        else if (r === 0) t = String(A[c - 1]);
        else if (c === 0) t = String(B[r - 1]);
        else if (o.revealed) t = String(A[c - 1] * B[r - 1]);
        if (t) {
          ctx.fillStyle = theme.lineInk;
          ctx.fillText(t, cx + cw / 2, cy + ch / 2 + 1);
        }
      }
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, (cols + 1) * cw, (rows + 1) * ch);
    ctx.fillStyle = theme.muted;
    ctx.font = "600 14px " + font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      o.revealed
        ? o.a + " × " + o.b + " = " + o.a * o.b
        : o.a + " × " + o.b,
      o.x,
      o.y - 7,
    );
    ctx.restore();
  },

  Dialog: GridMethodDialog,
});

export default gridMethodTool;
