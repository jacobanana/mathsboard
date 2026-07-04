// CanvasTool with dialog. Chunking division by repeated subtraction.
//
// Ported from maths-whiteboard.html: objSize 'chunking' case (line 211),
// drawChunking (line 256), chunkingDialog (lines 504-511).

import { defineCanvasTool } from "@/tools/registry";
import { ChunkingDialog } from "@/tools/chunking/Dialog";

export interface ChunkingParams {
  dividend: number;
  divisor: number;
}

// --- the chunks, step by step --------------------------------------------
// Chunking domain math; lives with the tool, not in shared drawHelpers.

interface ChunkResult {
  chunks: { mult: number; sub: number }[];
  answer: number;
  remainder: number;
}

function chunkSteps(dividend: number, divisor: number): ChunkResult {
  let rem = dividend;
  const chunks: ChunkResult["chunks"] = [];
  const q = Math.floor(dividend / divisor);
  const tens = Math.floor(q / 10) * 10;
  if (tens > 0) {
    chunks.push({ mult: tens, sub: tens * divisor });
    rem -= tens * divisor;
  }
  const ones = q - tens;
  if (ones > 0) {
    chunks.push({ mult: ones, sub: ones * divisor });
    rem -= ones * divisor;
  }
  return { chunks, answer: q, remainder: rem };
}

export const chunkingTool = defineCanvasTool<ChunkingParams>({
  kind: "canvas",
  type: "chunking",
  name: "Chunking",
  blurb: "repeated subtraction",
  category: "number",
  answer: true,

  defaults: () => ({ dividend: 196, divisor: 14 }),

  size: (p) => {
    let n = 0;
    const q = Math.floor(p.dividend / p.divisor);
    if (Math.floor(q / 10) * 10 > 0) n++;
    if (q - Math.floor(q / 10) * 10 > 0) n++;
    // Reserve the ladder space whether or not the answer is shown, so the
    // box never reflows when the answer is toggled.
    return { w: 320, h: 34 + n * 52 + 54 };
  },

  draw: ({ ctx, theme, font }, o) => {
    const { chunks, answer, remainder } = chunkSteps(o.dividend, o.divisor);
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.lineInk;
    const rx = o.x + o.w - 96;
    let y = o.y + 26;
    if (!o.revealed) {
      ctx.font = "600 22px " + font;
      ctx.textAlign = "left";
      ctx.fillText(o.dividend + " ÷ " + o.divisor + " =", o.x + 10, y);
      ctx.restore();
      return;
    }
    ctx.font = "600 22px " + font;
    ctx.textAlign = "right";
    let run = o.dividend;
    ctx.fillText(String(run), rx, y);
    chunks.forEach((ch) => {
      y += 30;
      ctx.textAlign = "right";
      ctx.fillStyle = theme.lineInk;
      ctx.font = "600 22px " + font;
      ctx.fillText("− " + ch.sub, rx, y);
      ctx.textAlign = "left";
      ctx.font = "600 13px " + font;
      ctx.fillStyle = theme.muted;
      ctx.fillText("(" + ch.mult + " × " + o.divisor + ")", rx + 14, y);
      y += 10;
      ctx.strokeStyle = theme.lineInk;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(rx - 70, y);
      ctx.lineTo(rx, y);
      ctx.stroke();
      y += 12;
      run -= ch.sub;
      ctx.textAlign = "right";
      ctx.font = "600 22px " + font;
      ctx.fillStyle = theme.lineInk;
      ctx.fillText(String(run), rx, y);
    });
    y += 34;
    ctx.textAlign = "left";
    ctx.font = "700 20px " + font;
    ctx.fillText(
      "Answer: " + answer + (remainder ? " r " + remainder : ""),
      o.x + 10,
      y,
    );
    ctx.restore();
  },

  Dialog: ChunkingDialog,
});

export default chunkingTool;
