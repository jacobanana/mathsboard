// CanvasTool (canvas + dialog): Fraction to decimal to percentage.
//
// Ported from maths-whiteboard.html: size case (line 216), drawFDP (line 285),
// fdpDialog (lines 551-558).

import { defineCanvasTool } from "@/tools/registry";
import { fmtNum, fillPanel } from "@/canvas/drawHelpers";
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
    const dec = o.num / o.den,
      pct = dec * 100;
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
    const labels: [string, string][] = [
      ["Fraction", o.num + "/" + o.den],
      ["Decimal", o.revealed ? fmtNum(dec) : "?"],
      ["Percentage", o.revealed ? fmtNum(pct) + "%" : "?"],
    ];
    const colW = bw / 3;
    ctx.textAlign = "center";
    const ly = by + bh + 22;
    labels.forEach(([t, v], i) => {
      const cxL = bx + colW * i + colW / 2;
      ctx.fillStyle = theme.muted;
      ctx.font = "600 12px " + font;
      ctx.fillText(t, cxL, ly);
      ctx.fillStyle = i === 0 ? theme.lineInk : theme.bar;
      ctx.font = "700 20px " + font;
      ctx.fillText(v, cxL, ly + 24);
    });
    ctx.restore();
  },

  Dialog: FDPDialog,
});

export default fdpTool;
