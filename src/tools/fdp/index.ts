// CanvasTool (canvas + dialog): Fraction to decimal to percentage.
//
// Ported from maths-whiteboard.html: size case (line 216), drawFDP (line 285),
// fdpDialog (lines 551-558).

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { FDPDialog } from "@/tools/fdp/Dialog";

export interface FDPParams {
  num: number;
  den: number;
}

export const fdpTool = defineCanvasTool<FDPParams>({
  kind: "canvas",
  type: "fdp",
  name: "Fraction ↔ decimal ↔ %",
  blurb: "equivalents",
  category: "fractions",
  answer: true,

  defaults: () => ({ num: 3, den: 4 }),

  size: () => ({ w: 340, h: 150 }),

  draw: ({ ctx, theme, font }, o) => {
    const dec = o.num / o.den;
    ctx.save();
    fillPanel(ctx, o);
    ctx.fillStyle = theme.lineInk;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = "700 18px " + font;
    ctx.fillText("Fraction → decimal → percentage", o.x + 16, o.y + 26);
    const bx = o.x + 16,
      bw = o.w - 32,
      by = o.y + 42,
      bh = 30;
    ctx.fillStyle = "#fff";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = theme.shade;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(dec, 1)), bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    const labels = ["Fraction", "Decimal", "Percentage"];
    const colW = bw / 3;
    ctx.textAlign = "center";
    const ly = by + bh + 22;
    labels.forEach((t, i) => {
      const cxL = bx + colW * i + colW / 2;
      ctx.fillStyle = theme.muted;
      ctx.font = "600 12px " + font;
      ctx.fillText(t, cxL, ly);
      // Decimal + percentage are type-in boxes (see `inputs`); only the given
      // fraction is drawn on the canvas.
      if (i === 0) {
        ctx.fillStyle = theme.lineInk;
        ctx.font = "700 20px " + font;
        ctx.fillText(o.num + "/" + o.den, cxL, ly + 24);
      }
    });
    ctx.restore();
  },

  // Type-in boxes for the decimal and percentage equivalents, centred under
  // their column headers at fixed positions (natural width 340). Answers can be
  // decimals, so marking is tolerant (answersMatch): e.g. 3/4 → 0.75 and 75.
  inputs: {
    fields: (o) => {
      const bx = 16,
        bw = 340 - 32,
        colW = bw / 3;
      const ly = 42 + 30 + 22; // by + bh + 22, matching draw()
      const dec = o.num / o.den;
      const h = 30,
        boxW = colW * 0.8;
      const mk = (i: number, key: string, correct: number): InputFieldSpec => ({
        key,
        correct,
        x: bx + colW * i + colW / 2 - boxW / 2,
        y: ly + 4,
        w: boxW,
        h,
      });
      return [mk(1, "dec", dec), mk(2, "pct", dec * 100)];
    },
  },

  Dialog: FDPDialog,
});

export default fdpTool;
