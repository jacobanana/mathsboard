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

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import {
  drawStackFrac,
  fillPanel,
  fmtNum,
  measureTextWidth,
  FONT,
} from "@/canvas/drawHelpers";
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
    // The answer is a type-in box after "of N =" (see `inputs`).
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

  // Single answer box after the "num/den of whole =" prompt. Its x mirrors
  // draw(): stacked-fraction width (max of num/den at 700 24px, +6, per
  // drawStackFrac) + the "of N =" text width at 600 22px.
  inputs: {
    fields: (o) => {
      const cy = 34;
      const fw =
        Math.max(
          measureTextWidth(String(o.num), "700 24px " + FONT),
          measureTextWidth(String(o.den), "700 24px " + FONT),
        ) + 6;
      const mid = "of " + fmtNum(o.whole) + " =";
      const x = 14 + fw + 12 + measureTextWidth(mid, "600 22px " + FONT) + 12;
      const h = 32;
      const out: InputFieldSpec[] = [
        {
          key: "ans",
          x,
          y: cy - h / 2,
          w: 74,
          h,
          correct: (o.whole / o.den) * o.num,
        },
      ];
      return out;
    },
  },

  Dialog: FracAmountDialog,
});
