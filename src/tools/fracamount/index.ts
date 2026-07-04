// CanvasTool (canvas + dialog): "Fraction of an amount".
//
// Ported from maths-whiteboard.html:
//   size:   line 214      (objSize case 'fracamount').
//   draw:   lines 282-283 (drawStackFrac + drawFracAmount).
//   dialog: lines 532-540 (fracAmountDialog) -> ./Dialog.tsx.
//
// Mechanical transform of the prototype draw: tctx -> kit.ctx, css("--line-ink")
// -> theme.lineInk, css("--muted") -> theme.muted, FONT -> kit.font; shared
// helpers (drawStackFrac, fillPanel, fmtNum) imported and given explicit
// ctx/theme per the foundation contract. All numbers/offsets kept identical.

import { defineCanvasTool } from "@/tools/registry";
import { drawStackFrac, fillPanel, fmtNum } from "@/canvas/drawHelpers";
import { FracAmountDialog } from "@/tools/fracamount/Dialog";

export interface FracAmountParams {
  num: number;
  den: number;
  whole: number;
}

export default defineCanvasTool<FracAmountParams>({
  kind: "canvas",
  type: "fracamount",
  name: "Fraction of an amount",
  blurb: "e.g. ¾ of 20",
  category: "fractions",
  answer: true,

  defaults: () => ({ num: 3, den: 4, whole: 20 }),

  // Space reserved whether or not the answer is shown (no reflow on toggle).
  size: () => ({ w: 340, h: 128 }),

  draw: ({ ctx, theme, font }, o) => {
    const part = o.whole / o.den,
      ans = part * o.num;
    ctx.save();
    fillPanel(ctx, o);
    const cy = o.y + 34;
    ctx.textBaseline = "middle";
    let x = o.x + 14;
    const fw = drawStackFrac(ctx, theme, font, x, cy, o.num, o.den, 24);
    x += fw + 12;
    ctx.fillStyle = theme.lineInk;
    ctx.font = "600 22px " + font;
    ctx.textAlign = "left";
    const mid = "of " + fmtNum(o.whole) + " =";
    ctx.fillText(mid, x, cy);
    x += ctx.measureText(mid).width + 12;
    ctx.font = "700 24px " + font;
    ctx.fillText(o.revealed ? fmtNum(ans) : "", x, cy);
    if (o.revealed) {
      ctx.font = "600 17px " + font;
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "left";
      ctx.fillText(
        "Divide by " +
          o.den +
          ":   " +
          fmtNum(o.whole) +
          " ÷ " +
          o.den +
          " = " +
          fmtNum(part),
        o.x + 16,
        o.y + 78,
      );
      ctx.fillText(
        "Times by " +
          o.num +
          ":   " +
          fmtNum(part) +
          " × " +
          o.num +
          " = " +
          fmtNum(ans),
        o.x + 16,
        o.y + 106,
      );
    }
    ctx.restore();
  },

  Dialog: FracAmountDialog,
});
