// CanvasTool (canvas + dialog) — the box / grid method for multiplication.
//
// Splits each factor into its place-value parts (partition) and lays them out
// as a grid: column headers from partition(a), row headers from partition(b),
// optional filled-in products.
//
// Ported from maths-whiteboard.html: objSize case 'gridmethod' (line 205),
// drawGridMethod (line 241), gridMethodDialog (lines 414-421).

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import {
  partition,
  fillPanel,
  RESULT_FOOT,
  resultField,
  drawResultEquals,
} from "@/canvas/drawHelpers";
import { GridMethodDialog } from "@/tools/gridmethod/Dialog";

export interface GridMethodParams {
  a: number;
  b: number;
}

// Top band inside the box that houses the "a × b" operation label. Keeping the
// header inside the object's bounding box (rather than floating above it) makes
// it part of the selection area and clears the systemic "show answer" button,
// which AnswerButtonLayer floats just ABOVE the box's top-left corner.
const HEAD = 26;
// Bottom band houses the "= [result]" box — the sum of the products, which the
// grid cells only break down (shared result-footer helper in drawHelpers).

export const gridMethodTool = defineCanvasTool<GridMethodParams>({
  kind: "canvas",
  type: "gridmethod",
  name: "Multiplication grid",
  blurb: "box / grid method",
  category: "number",
  answer: true,

  defaults: () => ({ a: 34, b: 6 }),

  size: (p) => ({
    w: (partition(p.a).length + 1) * 72,
    h: (partition(p.b).length + 1) * 54 + HEAD + RESULT_FOOT,
  }),

  draw: ({ ctx, theme, font }, o) => {
    const A = partition(o.a),
      B = partition(o.b),
      cols = A.length,
      rows = B.length,
      cw = 72,
      ch = 54,
      gy = o.y + HEAD; // grid sits below the header band
    ctx.save();
    fillPanel(ctx, o);
    // Operation label, inside the header band at the top-left of the box.
    ctx.fillStyle = theme.muted;
    ctx.font = "600 14px " + font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    // The operation is the header; the answer goes in the footer result box.
    ctx.fillText(o.a + " × " + o.b, o.x, o.y + HEAD / 2);
    ctx.font = "600 18px " + font;
    ctx.textAlign = "center";
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++) {
        const cx = o.x + c * cw,
          cy = gy + r * ch;
        if ((r === 0 || c === 0) && !(r === 0 && c === 0)) {
          ctx.fillStyle = theme.accentSoft;
          ctx.fillRect(cx, cy, cw, ch);
        }
        ctx.strokeStyle = "#C3D4D2";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cw, ch);
        let t = "";
        if (r === 0 && c === 0) t = "×";
        else if (r === 0) t = String(A[c - 1]);
        else if (c === 0) t = String(B[r - 1]);
        // Inner product cells are type-in inputs (see `inputs`); the overlay
        // shows the value, so draw() paints only the header row + column.
        if (t) {
          ctx.fillStyle = theme.lineInk;
          ctx.fillText(t, cx + cw / 2, cy + ch / 2 + 1);
        }
      }
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, gy, (cols + 1) * cw, (rows + 1) * ch);
    // Footer: "=" then the result box (drawn by the input overlay), the sum of
    // the grid's products.
    drawResultEquals(
      ctx,
      theme.lineInk,
      font,
      o.x,
      gy + (rows + 1) * ch,
      (cols + 1) * cw,
    );
    ctx.restore();
  },

  // Type-in answer boxes for the inner product cells (headers stay on canvas).
  // Cell variant: the grid already draws the cell borders, so the inputs fill
  // them frameless. Grid geometry matches draw(): cw 72, ch 54, offset by HEAD.
  inputs: {
    fields: (o) => {
      const A = partition(o.a),
        B = partition(o.b),
        cw = 72,
        ch = 54;
      const out: InputFieldSpec[] = [];
      for (let j = 0; j < B.length; j++)
        for (let i = 0; i < A.length; i++)
          out.push({
            key: "r" + j + "c" + i,
            x: (i + 1) * cw, // column 0 is the B-header column
            y: HEAD + (j + 1) * ch, // row 0 is the A-header row
            w: cw,
            h: ch,
            correct: A[i] * B[j],
            variant: "cell",
          });
      // The result box in the footer (the sum of the products), matching draw().
      out.push(
        resultField(
          HEAD + (B.length + 1) * ch,
          (A.length + 1) * cw,
          o.a * o.b,
        ),
      );
      return out;
    },
  },

  Dialog: GridMethodDialog,
});

export default gridMethodTool;
