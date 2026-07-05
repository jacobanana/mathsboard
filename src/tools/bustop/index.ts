// CanvasTool (canvas + dialog): the bus-stop (short division) method.
//
// Ported from maths-whiteboard.html:
//   - size case 'bustop'  (line 217)
//   - drawBusStop         (line 252)
//   - busStopDialog       (lines 460-468)
//
// Mechanical transform of draw: tctx -> ctx; css('--line-ink') -> theme.lineInk;
// FONT -> font; literal hex ('#D64545') stays literal. All numeric constants,
// offsets and branching are identical to the original.

import { defineCanvasTool } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { BusStopDialog } from "@/tools/bustop/Dialog";

export interface BusStopParams {
  dividend: number;
  divisor: number;
  long: boolean;
}

export default defineCanvasTool<BusStopParams>({
  kind: "canvas",
  type: "bustop",
  name: "Division",
  blurb: "bus-stop method",
  category: "number",
  answer: true,

  defaults: () => ({ dividend: 156, divisor: 4, long: false }),

  size: (p) => ({
    w: String(p.divisor).length * 16 + String(p.dividend).length * 34 + 60,
    h: p.long ? 220 : 92,
  }),

  draw: ({ ctx, theme, font }, o) => {
    const ds = String(o.divisor);
    const dd = String(o.dividend);
    const digitW = 34;
    ctx.save();
    fillPanel(ctx, o);
    ctx.font = "600 26px " + font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.lineInk;
    const divW = ctx.measureText(ds).width;
    const midY = o.y + 48;
    ctx.textAlign = "right";
    ctx.fillText(ds, o.x + divW, midY);
    const brX = o.x + divW + 8;
    const ddW = dd.length * digitW;
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(brX, midY - 20);
    ctx.quadraticCurveTo(brX + 11, midY, brX, midY + 20);
    ctx.moveTo(brX, midY - 20);
    ctx.lineTo(brX + 14 + ddW, midY - 20);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = theme.lineInk;
    for (let i = 0; i < dd.length; i++)
      ctx.fillText(dd[i], brX + 20 + i * digitW, midY);
    if (o.revealed) {
      let carry = 0;
      const q: number[] = [];
      const carries: number[] = [];
      for (let i = 0; i < dd.length; i++) {
        const cur = carry * 10 + +dd[i];
        q.push(Math.floor(cur / o.divisor));
        carry = cur % o.divisor;
        carries.push(carry);
      }
      ctx.font = "600 24px " + font;
      ctx.fillStyle = theme.lineInk;
      for (let i = 0; i < dd.length; i++)
        ctx.fillText(String(q[i]), brX + 20 + i * digitW, midY - 36);
      ctx.font = "700 13px " + font;
      ctx.fillStyle = "#D64545";
      for (let i = 0; i < dd.length - 1; i++) {
        if (carries[i] > 0)
          ctx.fillText(
            String(carries[i]),
            brX + 20 + (i + 1) * digitW - digitW * 0.42,
            midY - 13,
          );
      }
      const rem = carries[carries.length - 1];
      if (rem > 0) {
        ctx.font = "600 22px " + font;
        ctx.textAlign = "left";
        ctx.fillStyle = theme.lineInk;
        ctx.fillText("r " + rem, brX + 24 + dd.length * digitW, midY);
      }
    }
    ctx.restore();
  },

  Dialog: BusStopDialog,
});
