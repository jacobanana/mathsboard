// CanvasTool (canvas + dialog): the Fractions tool.
//
// Two sub-modes share one object type:
//   - bars   : 1 or 2 comparison bars (second optional), each parts/shaded.
//   - circle : a pie split into parts with some shaded.
// (The former "wall" mode is now its own tool: src/tools/fractionwall.)
//
// Ported verbatim from maths-whiteboard.html:
//   size   : objSize 'fraction' case (line 202)
//   draw   : drawFraction + drawFractionCircle (lines 233, 235)
//   dialog : fractionDialog (lines 477-493)
//
// Mechanical transforms only: tctx -> kit.ctx; css('--line-ink') -> theme.lineInk
// etc.; FONT -> kit.font. All numeric constants, offsets and branches kept identical.

import { defineCanvasTool } from "@/tools/registry";
import { FractionDialog } from "@/tools/fraction/Dialog";

export interface FractionBar {
  parts: number;
  shaded: number;
}

export interface FractionParams {
  mode: "bars" | "circle";
  bars?: FractionBar[];
  parts?: number;
  shaded?: number;
}

export const fractionTool = defineCanvasTool<FractionParams>({
  kind: "canvas",
  type: "fraction",
  name: "Fractions",
  blurb: "bars · circle",
  category: "fractions",

  defaults: () => ({ mode: "bars", bars: [{ parts: 4, shaded: 1 }] }),

  size: (p) => {
    if (p.mode === "circle") {
      const r = 86;
      return { w: 2 * r, h: 2 * r + 40 };
    }
    {
      const bh = 58,
        gap = 20;
      const bars = p.bars as FractionBar[];
      return { w: 358, h: bars.length * bh + (bars.length - 1) * gap };
    }
  },

  draw: ({ ctx, theme, font }, o) => {
    if (o.mode === "circle") return drawFractionCircle(ctx, theme, font, o);
    const labelW = 58,
      barX = o.x + labelW,
      barW = o.w - labelW,
      barH = 58,
      gap = 20;
    ctx.save();
    ctx.font = "700 24px " + font;
    let y = o.y;
    (o.bars as FractionBar[]).forEach((bar) => {
      const cw = barW / bar.parts;
      ctx.fillStyle = "#fff";
      ctx.fillRect(barX, y, barW, barH);
      ctx.fillStyle = theme.shade;
      ctx.globalAlpha = 0.85;
      for (let k = 0; k < bar.shaded && k < bar.parts; k++)
        ctx.fillRect(barX + k * cw, y, cw, barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.lineInk;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(barX, y, barW, barH);
      ctx.lineWidth = 1.5;
      for (let k = 1; k < bar.parts; k++) {
        ctx.beginPath();
        ctx.moveTo(barX + k * cw, y);
        ctx.lineTo(barX + k * cw, y + barH);
        ctx.stroke();
      }
      ctx.fillStyle = theme.lineInk;
      ctx.textAlign = "center";
      const lx = o.x + labelW / 2,
        ly = y + barH / 2;
      ctx.fillText(String(bar.shaded), lx, ly - 5);
      ctx.beginPath();
      ctx.moveTo(lx - 14, ly + 2);
      ctx.lineTo(lx + 14, ly + 2);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillText(String(bar.parts), lx, ly + 24);
      y += barH + gap;
    });
    ctx.restore();
  },

  Dialog: FractionDialog,
});

function drawFractionCircle(
  ctx: CanvasRenderingContext2D,
  theme: import("@/styles/theme").Theme,
  font: string,
  o: import("@/board/types").BoardObjectBase & FractionParams,
): void {
  const r = 86,
    cx = o.x + r,
    cy = o.y + r;
  const parts = o.parts as number,
    shaded = o.shaded as number;
  ctx.save();
  for (let k = 0; k < parts; k++) {
    const a0 = -Math.PI / 2 + (k / parts) * 2 * Math.PI,
      a1 = -Math.PI / 2 + ((k + 1) / parts) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = k < shaded ? theme.shade : "#FCFAF4";
    ctx.globalAlpha = k < shaded ? 0.85 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = theme.lineInk;
  ctx.textAlign = "center";
  ctx.font = "700 22px " + font;
  ctx.fillText(shaded + " / " + parts, cx, cy + r + 28);
  ctx.restore();
}

export default fractionTool;
