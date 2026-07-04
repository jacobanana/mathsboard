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
// NO DIALOG and NOT in the Insert gallery: like free text, an object is
// created by clicking the board with the maths dock tool ("math" mode) and
// edited in place via a MathLive <math-field> overlay with its virtual maths
// keyboard (canvas/mathEditor.ts + canvas/interactions/math.ts). The STORED
// format is unchanged from the old dialog days: { latex, natW, natH }, where
// natW/natH are the notation's layout size at MATH_BASE_PX, measured by the
// editor at commit time (svg.ts#measureMath), so size() stays synchronous and
// the standard uniform-resize machinery applies — the image tool's
// intrinsic-dimensions trick.

import { defineCanvasTool } from "@/tools/registry";
import { getMathImage, mathImageState } from "@/tools/mathtext/render";
import { theme } from "@/styles/theme";
// The KaTeX page stylesheet serves svg.ts's hidden-DOM measurement pass.
// Imported from this eagerly-registered module so measurement works on a
// saved board that loads straight into draw().
import "katex/dist/katex.min.css";

export interface MathTextParams {
  /** LaTeX source, e.g. "\\frac{3}{4} + \\frac{1}{2}". */
  latex: string;
  /** Layout size in px at MATH_BASE_PX, measured at editor commit. */
  natW: number;
  natH: number;
  /** Notation colour. Objects saved before this field existed omit it —
   *  readers fall back to theme.ink. */
  color: string;
}

/** The font size the notation is laid out (and edited) at. Shared by the
 *  raster pipeline (svg.ts) and the in-place editor (canvas/mathEditor.ts) so
 *  the editing overlay appears at the same size as the committed render. */
export const MATH_BASE_PX = 26;

/** Cap the initial on-board size; the user can resize afterwards. */
const MAX_W = 560;
const MAX_H = 420;

export const mathTextTool = defineCanvasTool<MathTextParams>({
  kind: "canvas",
  type: "mathtext",
  name: "Maths notation",
  blurb: "fractions · powers · √",
  category: "number",
  // Created by clicking with the maths dock tool, not the Insert gallery.
  inGallery: false,

  defaults: () => ({ latex: "", natW: 220, natH: 64, color: theme.ink }),

  size: (p) => {
    const s = Math.min(1, MAX_W / (p.natW || 1), MAX_H / (p.natH || 1));
    return {
      w: Math.max(24, Math.round(p.natW * s)),
      h: Math.max(24, Math.round(p.natH * s)),
    };
  },

  draw: ({ ctx, theme, font }, o) => {
    // Empty = mid-creation (the beat between the editor committing and the
    // async measure landing) or an undone empty-abort. Paint nothing, exactly
    // like an empty free-text object — never a stuck placeholder box.
    if (!o.latex) return;
    const color = o.color || theme.ink; // legacy objects predate the field
    const img = getMathImage(o.latex, color);
    if (img) {
      ctx.drawImage(img, o.x, o.y, o.w, o.h);
      return;
    }
    // Placeholder while rasterising / if the render pipeline failed.
    const failed = mathImageState(o.latex, color) === "error";
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
});

export default mathTextTool;
