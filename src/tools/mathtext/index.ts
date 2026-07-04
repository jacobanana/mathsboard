// Maths-notation tool (roadmap B1): proper rendered notation — stacked
// fractions, powers, roots, real x and / signs — from LaTeX via KaTeX.
//
// A CANVAS tool, deliberately not a React widget: overlay widgets are invisible
// to PNG export and sit outside canvas z-order (feature-roadmap.md §5). The
// draw path is the image tool's pattern exactly: draw() synchronously pulls a
// cached HTMLImageElement (render.ts rasterises KaTeX -> SVG -> Image in the
// background and nudges a repaint when ready) and paints a placeholder until
// then.
//
// The object stores { latex, natW, natH }. natW/natH are the notation's layout
// size, measured by the Dialog at submit time (svg.ts#measureMath), so size()
// stays synchronous and the standard uniform-resize machinery applies — the
// image tool's intrinsic-dimensions trick.

import { defineCanvasTool } from "@/tools/registry";
import { getMathImage, mathImageState } from "@/tools/mathtext/render";
import { MathTextDialog } from "@/tools/mathtext/Dialog";
// The KaTeX page stylesheet serves BOTH the dialog's live preview and svg.ts's
// hidden-DOM measurement pass. Imported from this eagerly-registered module so
// measurement works even if the dialog never opens (e.g. a saved board with
// notation loads straight into draw()).
import "katex/dist/katex.min.css";

export interface MathTextParams {
  /** LaTeX source, e.g. "\\frac{3}{4} + \\frac{1}{2}". */
  latex: string;
  /** Layout size in px at the base font size, measured at dialog submit. */
  natW: number;
  natH: number;
}

/** Cap the initial on-board size; the user can resize afterwards. */
const MAX_W = 560;
const MAX_H = 420;

export const mathTextTool = defineCanvasTool<MathTextParams>({
  kind: "canvas",
  type: "mathtext",
  name: "Maths notation",
  blurb: "fractions · powers · √",
  category: "number",

  defaults: () => ({ latex: "", natW: 220, natH: 64 }),

  size: (p) => {
    const s = Math.min(1, MAX_W / (p.natW || 1), MAX_H / (p.natH || 1));
    return {
      w: Math.max(24, Math.round(p.natW * s)),
      h: Math.max(24, Math.round(p.natH * s)),
    };
  },

  draw: ({ ctx, theme, font }, o) => {
    const img = getMathImage(o.latex);
    if (img) {
      ctx.drawImage(img, o.x, o.y, o.w, o.h);
      return;
    }
    // Placeholder while rasterising / if the render pipeline failed.
    const failed = mathImageState(o.latex) === "error";
    ctx.save();
    ctx.fillStyle = "#F4F6F5";
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(o.x, o.y, o.w, o.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = "600 15px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      failed ? "Maths unavailable" : "Drawing maths…",
      o.x + o.w / 2,
      o.y + o.h / 2,
      Math.max(8, o.w - 16),
    );
    ctx.restore();
  },

  Dialog: MathTextDialog,
});

export default mathTextTool;
