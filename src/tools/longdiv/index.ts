// CanvasTool (canvas + dialog): the full long-division ladder.
//
// Ported from maths-whiteboard.html: objSize case 'longdiv' (line 210),
// drawLongDiv (line 254), longDivDialog (lines 495-502).

import { defineCanvasTool } from "@/tools/registry";
import { drawRightNum, fillPanel } from "@/canvas/drawHelpers";
import { LongDivDialog } from "@/tools/longdiv/Dialog";

export interface LongDivParams {
  dividend: number;
  divisor: number;
}

// --- the ladder, step by step ------------------------------------------------
// Long-division domain math; lives with the tool, not in shared drawHelpers.

interface LongDivResult {
  q: { d: number; draw: boolean; col: number }[];
  steps: { minuend: number; prod: number; rem: number; col: number }[];
  remainder: number;
}

function longDivSteps(dividend: number, divisor: number): LongDivResult {
  const digits = String(dividend).split("").map(Number);
  const v = divisor;
  let rem = 0;
  let started = false;
  const q: LongDivResult["q"] = [];
  const steps: LongDivResult["steps"] = [];
  for (let i = 0; i < digits.length; i++) {
    const w = rem * 10 + digits[i];
    const qd = Math.floor(w / v);
    rem = w - qd * v;
    if (qd > 0) started = true;
    q.push({ d: qd, draw: started, col: i });
    if (started) steps.push({ minuend: w, prod: qd * v, rem, col: i });
  }
  return { q, steps, remainder: rem };
}

export const longDivTool = defineCanvasTool<LongDivParams>({
  kind: "canvas",
  type: "longdiv",
  name: "Long division",
  blurb: "full ladder",
  category: "number",
  answer: true,

  defaults: () => ({ dividend: 4928, divisor: 7 }),

  size: (p) => {
    const dvW = String(p.divisor).length * 18 + 14;
    const ddW = String(p.dividend).length * 30;
    // Reserve the ladder space whether or not the answer is shown (no reflow).
    const st = longDivSteps(p.dividend, p.divisor).steps.length;
    const h = 58 + 38 + (2 * st + 1) * 38 + 16;
    return { w: dvW + ddW + 30, h };
  },

  draw: ({ ctx, theme, font }, o) => {
    const ds = String(o.divisor);
    const dd = String(o.dividend);
    const DW = 30;
    const RH = 38;
    ctx.save();
    fillPanel(ctx, o);
    ctx.font = "600 24px " + font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.lineInk;
    const divW = ctx.measureText(ds).width;
    const ddX0 = o.x + divW + 18;
    const qY = o.y + 18;
    const lineY = o.y + 34;
    const ddY = o.y + 58;
    ctx.textAlign = "right";
    ctx.fillText(ds, o.x + divW, ddY);
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    const brX = ddX0 - 8;
    ctx.beginPath();
    ctx.moveTo(brX, ddY - 18);
    ctx.quadraticCurveTo(brX - 9, ddY, brX, ddY + 18);
    ctx.moveTo(brX, lineY);
    ctx.lineTo(ddX0 + dd.length * DW, lineY);
    ctx.stroke();
    ctx.textAlign = "center";
    for (let i = 0; i < dd.length; i++)
      ctx.fillText(dd[i], ddX0 + i * DW + DW / 2, ddY);
    const info = longDivSteps(o.dividend, o.divisor);
    info.q.forEach((qd) => {
      if (qd.draw) ctx.fillText(String(qd.d), ddX0 + qd.col * DW + DW / 2, qY);
    });
    if (o.revealed) {
      let y = ddY + RH;
      info.steps.forEach((st) => {
        const rightX = ddX0 + (st.col + 1) * DW;
        ctx.textAlign = "center";
        ctx.fillStyle = theme.lineInk;
        drawRightNum(ctx, st.prod, rightX, y, DW);
        const pStr = String(st.prod);
        ctx.fillText("−", rightX - pStr.length * DW - DW * 0.45, y);
        ctx.strokeStyle = theme.lineInk;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(
          rightX - Math.max(pStr.length, String(st.rem).length) * DW,
          y + RH * 0.5,
        );
        ctx.lineTo(rightX, y + RH * 0.5);
        ctx.stroke();
        drawRightNum(ctx, st.rem, rightX, y + RH, DW);
        y += 2 * RH;
      });
    }
    ctx.restore();
  },

  Dialog: LongDivDialog,
});

export default longDivTool;
