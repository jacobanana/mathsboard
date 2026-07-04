// CanvasTool (canvas + dialog). Long multiplication, column method.
//
// Ported from maths-whiteboard.html:
//   size  -> objSize case 'longmult'      (line 206)
//   draw  -> drawLongMult                 (line 243)
//   dialog -> longMultDialog              (lines 423-430)

import { defineCanvasTool } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { LongMultDialog } from "@/tools/longmult/Dialog";

export interface LongMultParams {
  a: number;
  b: number;
}

export default defineCanvasTool<LongMultParams>({
  kind: "canvas",
  type: "longmult",
  name: "Long multiplication",
  blurb: "column method",
  category: "number",
  answer: true,

  defaults: () => ({ a: 34, b: 27 }),

  size: (p) => {
    const nP = String(p.b).length;
    const R = 2 + nP + (nP > 1 ? 1 : 0);
    const tc = String(p.a * p.b).length;
    return { w: (tc + 1) * 32, h: R * 42 + 12 };
  },

  draw: ({ ctx, theme, font }, o) => {
    const a = o.a,
      b = o.b,
      ans = a * b,
      bS = String(b),
      partials: number[] = [];
    for (let i = 0; i < bS.length; i++)
      partials.push(a * +bS[bS.length - 1 - i] * Math.pow(10, i));
    const tc = String(ans).length,
      cw = 32,
      rh = 42,
      signW = cw,
      pad = 6,
      numX0 = o.x + signW;
    ctx.save();
    fillPanel(ctx, o);
    ctx.font = "600 26px " + font;
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
    ctx.fillText("×", o.x + signW / 2, cY(1));
    const lx0 = o.x + 4,
      lx1 = numX0 + tc * cw;
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx0, o.y + pad + 2 * rh - 2);
    ctx.lineTo(lx1, o.y + pad + 2 * rh - 2);
    ctx.stroke();
    if (partials.length > 1) {
      const aR = 2 + partials.length;
      ctx.beginPath();
      ctx.moveTo(lx0, o.y + pad + aR * rh - 2);
      ctx.lineTo(lx1, o.y + pad + aR * rh - 2);
      ctx.stroke();
    }
    if (o.revealed) {
      partials.forEach((p, k) => drawNumRow(p, 2 + k));
      if (partials.length > 1) drawNumRow(ans, 2 + partials.length);
    }
    ctx.restore();
  },

  Dialog: LongMultDialog,
});
