// CanvasTool (canvas + dialog): "Percentage of an amount".
//
// Ported from maths-whiteboard.html:
//   - size:   objSize case 'percamount' (line 215).
//   - draw:   drawPercAmount (line 284).
//   - dialog: percAmountDialog (lines 542-549) -> ./Dialog.tsx.
//
// Mechanical port only: tctx -> ctx; css('--line-ink') -> theme.lineInk,
// css('--muted') -> theme.muted; FONT -> font; fillPanel now takes ctx.

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import { fmtNum, fillPanel, measureTextWidth, FONT } from "@/canvas/drawHelpers";
import { PercAmountDialog } from "@/tools/percamount/Dialog";

export interface PercAmountParams {
  pct: number;
  whole: number;
}

export const percAmountTool = defineCanvasTool<PercAmountParams>({
  kind: "canvas",
  type: "percamount",
  name: "Percentage of an amount",
  blurb: "e.g. 15% of 80",
  category: "fractions",
  answer: true,

  defaults: () => ({ pct: 15, whole: 80 }),

  // Space reserved whether or not the answer is shown (no reflow on toggle).
  size: () => ({ w: 340, h: 156 }),

  draw: ({ ctx, theme, font }, o) => {
    const ans = (o.whole * o.pct) / 100,
      ten = o.whole / 10,
      one = o.whole / 100;
    ctx.save();
    fillPanel(ctx, o);
    const cy = o.y + 34;
    ctx.fillStyle = theme.lineInk;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "700 24px " + font;
    const head = fmtNum(o.pct) + "% of " + fmtNum(o.whole) + " =";
    ctx.fillText(head, o.x + 16, cy);
    // The answer is a type-in box after the prompt (see `inputs`).
    if (o.revealed) {
      ctx.font = "600 17px " + font;
      ctx.fillStyle = theme.muted;
      let y = o.y + 74;
      ctx.fillText(
        "10% of " + fmtNum(o.whole) + " = " + fmtNum(ten) + "   (÷ 10)",
        o.x + 16,
        y,
      );
      y += 26;
      ctx.fillText(
        "1% of " + fmtNum(o.whole) + " = " + fmtNum(one) + "   (÷ 100)",
        o.x + 16,
        y,
      );
      y += 26;
      ctx.fillStyle = theme.lineInk;
      ctx.fillText(
        fmtNum(o.pct) + "% = " + fmtNum(one) + " × " + fmtNum(o.pct) + " = " + fmtNum(ans),
        o.x + 16,
        y,
      );
    }
    ctx.restore();
  },

  // Single answer box after the "pct% of whole =" prompt; its x mirrors draw()
  // (prompt drawn at 700 24px, +10 gap).
  inputs: {
    fields: (o) => {
      const cy = 34;
      const head = fmtNum(o.pct) + "% of " + fmtNum(o.whole) + " =";
      const h = 32;
      const out: InputFieldSpec[] = [
        {
          key: "ans",
          x: 16 + measureTextWidth(head, "700 24px " + FONT) + 10,
          y: cy - h / 2,
          w: 74,
          h,
          correct: (o.whole * o.pct) / 100,
        },
      ];
      return out;
    },
  },

  Dialog: PercAmountDialog,
});
