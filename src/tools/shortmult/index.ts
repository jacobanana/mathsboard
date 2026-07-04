// CanvasTool (canvas + dialog). Short multiplication — column method for a
// number × a single digit, with carries.
//
// Ported from maths-whiteboard.html: objSize case (line 207), drawShortMult
// (line 245), shortMultDialog (lines 432-439).

import { defineCanvasTool } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { ShortMultDialog } from "@/tools/shortmult/Dialog";

export interface ShortMultParams {
  a: number;
  b: number;
}

export default defineCanvasTool<ShortMultParams>({
  kind: "canvas",
  type: "shortmult",
  name: "Short multiplication",
  blurb: "× 1 digit, carries",
  category: "number",
  answer: true,

  defaults: () => ({ a: 236, b: 4 }),

  size: (p) => {
    const tc = String(p.a * p.b).length;
    return { w: (tc + 1) * 30, h: 26 + 3 * 40 + 14 };
  },

  draw: ({ ctx, theme, font }, o) => {
    const a = o.a,
      b = o.b,
      ans = a * b,
      tc = String(ans).length,
      cw = 30,
      rh = 40,
      pad = 26,
      numX0 = o.x + cw;
    ctx.save();
    fillPanel(ctx, o);
    ctx.font = "600 24px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.lineInk;
    const cY = (i: number) => o.y + pad + i * rh + rh / 2;
    const drawNumRow = (v: number, i: number) => {
      const s = String(v);
      for (let j = 0; j < s.length; j++) {
        const col = tc - s.length + j;
        ctx.fillText(s[j], numX0 + col * cw + cw / 2, cY(i));
      }
    };
    drawNumRow(a, 0);
    drawNumRow(b, 1);
    ctx.fillText("×", o.x + cw / 2, cY(1));
    const lx0 = o.x + 4,
      lx1 = numX0 + tc * cw;
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx0, o.y + pad + 2 * rh - 2);
    ctx.lineTo(lx1, o.y + pad + 2 * rh - 2);
    ctx.stroke();
    if (o.revealed) {
      drawNumRow(ans, 2);
      const aS = String(a);
      let carry = 0;
      const carryAtCol: Record<number, number> = {};
      for (let j = aS.length - 1; j >= 0; j--) {
        const prod = +aS[j] * b + carry;
        carry = Math.floor(prod / 10);
        if (carry > 0 && j > 0) {
          const col = tc - aS.length + (j - 1);
          carryAtCol[col] = carry;
        }
      }
      ctx.font = "700 13px " + font;
      ctx.fillStyle = "#D64545";
      Object.keys(carryAtCol).forEach((col) => {
        ctx.fillText(
          String(carryAtCol[+col]),
          numX0 + +col * cw + cw * 0.78,
          o.y + 11,
        );
      });
    }
    ctx.restore();
  },

  Dialog: ShortMultDialog,
});
