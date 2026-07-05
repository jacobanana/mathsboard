// CanvasTool (canvas + dialog). Area model / lattice (Napier's) multiplication.
//
// Ported from maths-whiteboard.html:
//   - objSize case 'arealattice'  (line 209)
//   - drawArealattice + drawLattice (lines 249-250)
//   - areaLatticeDialog            (lines 450-458)

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import {
  partition,
  fillPanel,
  RESULT_FOOT,
  resultField,
  drawResultEquals,
} from "@/canvas/drawHelpers";
import { AreaLatticeDialog } from "@/tools/arealattice/Dialog";

export interface AreaLatticeParams {
  mode: "area" | "lattice";
  a: number;
  b: number;
}

// Top band inside the box that houses the "a × b" operation label. Keeping the
// header inside the object's bounding box (rather than floating above it) makes
// it part of the selection area and clears the systemic "show answer" button,
// which AnswerButtonLayer floats just ABOVE the box's top-left corner. Only the
// area model draws this label; the lattice model has no header.
const HEAD = 26;

export default defineCanvasTool<AreaLatticeParams>({
  kind: "canvas",
  type: "arealattice",
  name: "Area / lattice",
  blurb: "rectangle / Napier",
  category: "number",
  answer: true,

  defaults: () => ({ mode: "area", a: 23, b: 14 }),

  size: (p) => {
    if (p.mode === "lattice") {
      const n = String(p.a).length,
        m = String(p.b).length,
        cell = 46;
      return { w: cell + n * cell + 30, h: 26 + m * cell + RESULT_FOOT };
    }
    return { w: 430, h: 210 + HEAD + RESULT_FOOT };
  },

  draw: ({ ctx, theme, font }, o) => {
    if (o.mode === "lattice") {
      // drawLattice
      const aS = String(o.a),
        bS = String(o.b),
        n = aS.length,
        m = bS.length,
        cell = 46;
      const gx = o.x + cell,
        gy = o.y + 26;
      ctx.save();
      fillPanel(ctx, o);
      ctx.font = "700 17px " + font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = theme.lineInk;
      for (let c = 0; c < n; c++)
        ctx.fillText(aS[c], gx + c * cell + cell / 2, o.y + 13);
      for (let r = 0; r < m; r++)
        ctx.fillText(bS[r], gx + n * cell + 16, gy + r * cell + cell / 2);
      for (let r = 0; r < m; r++)
        for (let c = 0; c < n; c++) {
          const x = gx + c * cell,
            y = gy + r * cell;
          ctx.strokeStyle = "#C3D4D2";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cell, cell);
          ctx.strokeStyle = "#9DB6B4";
          ctx.beginPath();
          ctx.moveTo(x + cell, y);
          ctx.lineTo(x, y + cell);
          ctx.stroke();
          if (o.revealed) {
            const p = +aS[c] * +bS[r];
            const tens = Math.floor(p / 10),
              ones = p % 10;
            ctx.fillStyle = theme.lineInk;
            ctx.font = "600 15px " + font;
            ctx.fillText(String(tens), x + cell * 0.32, y + cell * 0.32);
            ctx.fillText(String(ones), x + cell * 0.68, y + cell * 0.7);
          }
        }
      ctx.strokeStyle = theme.lineInk;
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, n * cell, m * cell);
      // Footer: "= [result]" box for the final answer (see `inputs`).
      drawResultEquals(ctx, theme.lineInk, font, o.x, gy + m * cell, o.w);
      ctx.restore();
      return;
    }

    // drawArealattice (area model)
    const A = partition(o.a),
      B = partition(o.b);
    const leftW = 44,
      topH = 26,
      rectX = o.x + leftW,
      rectY = o.y + HEAD + topH,
      rectW = o.w - leftW,
      rectH = o.h - HEAD - topH - RESULT_FOOT;
    const tA = A.reduce((s, v) => s + v, 0),
      tB = B.reduce((s, v) => s + v, 0);
    const colX = [rectX];
    let cx = rectX;
    A.forEach((v) => {
      cx += (v / tA) * rectW;
      colX.push(cx);
    });
    const rowY = [rectY];
    let cy = rectY;
    B.forEach((v) => {
      cy += (v / tB) * rectH;
      rowY.push(cy);
    });
    ctx.save();
    fillPanel(ctx, o); // the card, matching the lattice model (was transparent)
    ctx.font = "600 16px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r < B.length; r++)
      for (let c = 0; c < A.length; c++) {
        ctx.strokeStyle = "#C3D4D2";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          colX[c],
          rowY[r],
          colX[c + 1] - colX[c],
          rowY[r + 1] - rowY[r],
        );
        // Product cells are type-in inputs (see `inputs`); the overlay shows
        // the value, so draw() paints only the grid + the ×A / B headers.
      }
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.fillStyle = theme.lineInk;
    ctx.font = "700 16px " + font;
    for (let c = 0; c < A.length; c++)
      ctx.fillText(
        "×" + A[c],
        (colX[c] + colX[c + 1]) / 2,
        o.y + HEAD + topH / 2,
      );
    for (let r = 0; r < B.length; r++)
      ctx.fillText(String(B[r]), o.x + leftW / 2, (rowY[r] + rowY[r + 1]) / 2);
    ctx.font = "600 13px " + font;
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    // Operation is the header; the answer goes in the footer result box.
    ctx.fillText(o.a + " × " + o.b, o.x, o.y + HEAD / 2);
    // Footer: "= [result]" box for the final answer (see `inputs`).
    drawResultEquals(ctx, theme.lineInk, font, o.x, rectY + rectH, o.w);
    ctx.restore();
  },

  // Type-in answer boxes. AREA model: one frameless "cell" input per product
  // cell (the model draws the cell borders) plus the footer result box. LATTICE
  // model: just the footer result box — its diagonal tens/ones cells stay
  // reveal-only. Geometry mirrors draw() at natural size.
  inputs: {
    fields: (o) => {
      if (o.mode === "lattice") {
        const n = String(o.a).length,
          m = String(o.b).length,
          cell = 46;
        return [resultField(26 + m * cell, cell + n * cell + 30, o.a * o.b)];
      }
      const A = partition(o.a),
        B = partition(o.b);
      const leftW = 44,
        topH = 26;
      const rectX = leftW,
        rectY = HEAD + topH,
        rectW = 430 - leftW,
        rectH = 210 - topH;
      const tA = A.reduce((s, v) => s + v, 0),
        tB = B.reduce((s, v) => s + v, 0);
      const colX = [rectX];
      let cx = rectX;
      A.forEach((v) => {
        cx += (v / tA) * rectW;
        colX.push(cx);
      });
      const rowY = [rectY];
      let cy = rectY;
      B.forEach((v) => {
        cy += (v / tB) * rectH;
        rowY.push(cy);
      });
      const out: InputFieldSpec[] = [];
      for (let r = 0; r < B.length; r++)
        for (let c = 0; c < A.length; c++)
          out.push({
            key: "r" + r + "c" + c,
            x: colX[c],
            y: rowY[r],
            w: colX[c + 1] - colX[c],
            h: rowY[r + 1] - rowY[r],
            correct: A[c] * B[r],
            variant: "cell",
          });
      // Result box in the footer (the final product), matching draw().
      out.push(resultField(rectY + rectH, 430, o.a * o.b));
      return out;
    },
  },

  Dialog: AreaLatticeDialog,
});
