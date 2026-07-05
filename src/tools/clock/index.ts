// CanvasTool (canvas + dialog). Analog clock face with optional 12h / 24h
// digital readouts under it; a blank face hides the hands so pupils draw them.
//
// Ported from maths-whiteboard.html:
//   size  -> objSize case 'clock'  (line 218)
//   draw  -> drawClock            (line 287)
//   dialog -> clockDialog         (lines 560-569, see ./Dialog.tsx)

import { defineCanvasTool } from "@/tools/registry";
import { to12, to24, fillPanel } from "@/canvas/drawHelpers";
import { ClockDialog } from "@/tools/clock/Dialog";

export interface ClockParams {
  hour: number;
  minute: number;
  blank: boolean;
  show12: boolean;
  show24: boolean;
}

export const clockTool = defineCanvasTool<ClockParams>({
  kind: "canvas",
  type: "clock",
  name: "Clock",
  blurb: "analog + 12h / 24h",
  category: "time",

  defaults: () => ({
    hour: 3,
    minute: 45,
    blank: false,
    show12: true,
    show24: true,
  }),

  size: (p) => {
    const r = 90;
    return { w: 2 * r, h: 2 * r + (p.show12 ? 26 : 0) + (p.show24 ? 26 : 0) + 12 };
  },

  draw: ({ ctx, theme, font }, o) => {
    const r = 90,
      cx = o.x + r,
      cy = o.y + r;
    ctx.save();
    fillPanel(ctx, o);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    for (let m = 0; m < 60; m++) {
      const a = (m / 60) * 2 * Math.PI - Math.PI / 2,
        major = m % 5 === 0,
        len = major ? 12 : 6;
      ctx.strokeStyle = theme.lineInk;
      ctx.lineWidth = major ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(
        cx + Math.cos(a) * (r - 4 - len),
        cy + Math.sin(a) * (r - 4 - len),
      );
      ctx.stroke();
    }
    ctx.fillStyle = theme.lineInk;
    ctx.font = "700 18px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * 2 * Math.PI - Math.PI / 2;
      ctx.fillText(
        String(n),
        cx + Math.cos(a) * (r - 26),
        cy + Math.sin(a) * (r - 26),
      );
    }
    if (!o.blank) {
      const hr = (((o.hour % 12) + o.minute / 60) / 12) * 2 * Math.PI - Math.PI / 2,
        mn = (o.minute / 60) * 2 * Math.PI - Math.PI / 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = theme.lineInk;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hr) * r * 0.5, cy + Math.sin(hr) * r * 0.5);
      ctx.stroke();
      ctx.strokeStyle = theme.bar;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(mn) * r * 0.8, cy + Math.sin(mn) * r * 0.8);
      ctx.stroke();
      ctx.fillStyle = theme.lineInk;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
    let ly = cy + r + 22;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (o.show12) {
      ctx.font = "700 20px " + font;
      ctx.fillStyle = theme.lineInk;
      ctx.fillText(to12(o.hour, o.minute), cx, ly);
      ly += 26;
    }
    if (o.show24) {
      ctx.font = "700 20px " + font;
      ctx.fillStyle = theme.bar;
      ctx.fillText(to24(o.hour, o.minute), cx, ly);
    }
    ctx.restore();
  },

  Dialog: ClockDialog,
});

export default clockTool;
