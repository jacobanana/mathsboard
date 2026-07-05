// CanvasTool (canvas + dialog). Times tables: a full multiplication grid, or a
// single table to practise.
//
// Ported from maths-whiteboard.html:
//   - size:   objSize 'timestable' case (line 204).
//   - draw:   drawTimesTable (line 239).
//   - dialog: timesDialog (lines 404-412) -> ./Dialog.tsx.
//
// Mechanical transformations only: tctx -> ctx; css("--line-ink") ->
// theme.lineInk, css("--accent-soft") -> theme.accentSoft; FONT -> font;
// fillPanel(o) -> fillPanel(ctx, o). Literal hex (#C3D4D2) stays literal. All
// numeric constants, offsets and branching are identical to the original.

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { TimesTableDialog } from "@/tools/timestable/Dialog";

export type TimesTableParams =
  | { mode: "grid"; n: number }
  | { mode: "single"; k: number; rows: number };

export const timesTableTool = defineCanvasTool<TimesTableParams>({
  kind: "canvas",
  type: "timestable",
  name: "Times tables",
  blurb: "full grid or one table",
  category: "number",
  answer: true,

  defaults: () => ({ mode: "grid", n: 12 }),

  size: (p) => {
    if (p.mode === "single") return { w: 240, h: p.rows * 34 };
    return { w: (p.n + 1) * 40, h: (p.n + 1) * 40 };
  },

  draw: ({ ctx, theme, font }, o) => {
    ctx.save();
    fillPanel(ctx, o);
    ctx.textBaseline = "middle";
    if (o.mode === "single") {
      const k = o.k,
        rows = o.rows,
        rowH = 34,
        w = o.w;
      ctx.font = "600 18px " + font;
      for (let i = 1; i <= rows; i++) {
        const y = o.y + (i - 1) * rowH;
        ctx.textAlign = "right";
        ctx.fillStyle = theme.lineInk;
        ctx.fillText(i + " × " + k + " =", o.x + w * 0.6, y + rowH / 2);
        // The answer box AND its value are an overlaid <input> (see `inputs`
        // below) — it owns the framed box, so draw() only paints the prompt.
        // (One frame: no canvas strokeRect under the input's own border.)
      }
      ctx.restore();
      return;
    }
    const n = o.n,
      cell = 40;
    ctx.font = "600 17px " + font;
    ctx.textAlign = "center";
    for (let r = 0; r <= n; r++)
      for (let c = 0; c <= n; c++) {
        const cx = o.x + c * cell,
          cy = o.y + r * cell;
        if (r === 0 || c === 0) {
          ctx.fillStyle = theme.accentSoft;
          ctx.fillRect(cx, cy, cell, cell);
        }
        ctx.strokeStyle = "#C3D4D2";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cell, cell);
        let t = "";
        if (r === 0 && c === 0) t = "×";
        else if (r === 0) t = String(c);
        else if (c === 0) t = String(r);
        // Inner product cells are type-in inputs (see `inputs`); the overlay
        // shows the value, so draw() paints only the header row + column.
        if (t) {
          ctx.fillStyle = theme.lineInk;
          ctx.fillText(t, cx + cell / 2, cy + cell / 2 + 1);
        }
      }
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, (n + 1) * cell, (n + 1) * cell);
    ctx.restore();
  },

  // Type-in answer boxes for the "single table" mode (the spike for the
  // canvas-tool input capability). One input per row, matching the box drawn in
  // draw()'s single branch (bx/bw/by/bh at natural width 240, rowH 34); `correct`
  // gives live green/red marking. Grid mode has no inputs yet.
  inputs: {
    fields: (o) => {
      if (o.mode === "single") {
        const w = 240,
          rowH = 34;
        return Array.from({ length: o.rows }, (_, idx) => {
          const i = idx + 1;
          return {
            key: "r" + i,
            x: w * 0.64,
            y: (i - 1) * rowH + 5,
            w: w * 0.32,
            h: rowH - 10,
            correct: i * o.k,
          };
        });
      }
      // Full grid: a frameless input in every inner product cell. The tool
      // already draws the gridlines, so each input fills its cell (variant
      // "cell") rather than adding its own border.
      const n = o.n,
        cell = 40;
      const out: InputFieldSpec[] = [];
      for (let r = 1; r <= n; r++)
        for (let c = 1; c <= n; c++)
          out.push({
            key: "r" + r + "c" + c,
            x: c * cell,
            y: r * cell,
            w: cell,
            h: cell,
            correct: r * c,
            variant: "cell",
          });
      return out;
    },
  },

  Dialog: TimesTableDialog,
});

export default timesTableTool;
