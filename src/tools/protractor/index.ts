// CanvasTool (canvas + dialog). Protractor & angle-facts tool.
//
// Ported from maths-whiteboard.html:
//   size:   line 213   (objSize case 'protractor')
//   draw:   lines 267-280 (drawProtractor + drawAngleFacts)
//   dialog: lines 522-530 (protractorDialog) -> ./Dialog.tsx
//
// Two modes:
//   - 'protractor': a semicircular protractor with optional angle arms; `fill`
//     labels the swept angle.
//   - 'facts': an angle-facts diagram (line / point / triangle) where the
//     missing angle x is computed from the given angles; `fill` reveals x.
//
// Mechanical transformations from the prototype draw code:
//   tctx -> ctx; css('--line-ink') -> theme.lineInk; css('--accent') ->
//   theme.accent; css('--bar') -> theme.bar; css('--muted') -> theme.muted;
//   FONT -> font; fillPanel(o) -> fillPanel(ctx, o). All numeric constants,
//   offsets and branching are kept identical to the original.

import { defineCanvasTool } from "@/tools/registry";
import { fillPanel } from "@/canvas/drawHelpers";
import { ProtractorDialog } from "@/tools/protractor/Dialog";

export interface ProtractorParams {
  mode: "protractor" | "facts";
  // protractor mode
  angle: number;
  showArms: boolean;
  // facts mode
  fact: "line" | "point" | "triangle";
  given: number[];
  givenRaw: string;
}

export const protractorTool = defineCanvasTool<ProtractorParams>({
  kind: "canvas",
  type: "protractor",
  name: "Protractor & angles",
  blurb: "measure · missing angle",
  category: "geometry",
  answer: true,

  defaults: () => ({
    mode: "protractor",
    angle: 40,
    showArms: true,
    fact: "line",
    given: [65, 30],
    givenRaw: "65, 30",
  }),

  size: (p) => {
    if (p.mode === "facts") {
      if (p.fact === "triangle") return { w: 240, h: 170 };
      if (p.fact === "line") return { w: 300, h: 150 };
      return { w: 240, h: 240 };
    }
    return { w: 2 * 130 + 28, h: 130 + 28 };
  },

  draw: ({ ctx, theme, font }, o) => {
    if (o.mode === "facts") return drawAngleFacts(ctx, theme, font, o);

    const r = 130,
      cx = o.x + r + 14,
      cy = o.y + r + 14;
    ctx.save();
    ctx.fillStyle = "rgba(242,179,61,0.10)";
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI, false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
    for (let d = 0; d <= 180; d++) {
      const rad = (d * Math.PI) / 180,
        ox = Math.cos(rad),
        oy = -Math.sin(rad),
        len = d % 10 === 0 ? 12 : d % 5 === 0 ? 8 : 5;
      ctx.strokeStyle = theme.lineInk;
      ctx.lineWidth = d % 10 === 0 ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + ox * r, cy + oy * r);
      ctx.lineTo(cx + ox * (r - len), cy + oy * (r - len));
      ctx.stroke();
      if (d % 10 === 0) {
        ctx.fillStyle = theme.muted;
        ctx.font = "600 10px " + font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d), cx + ox * (r - 22), cy + oy * (r - 22));
      }
    }
    ctx.fillStyle = theme.lineInk;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();
    if (o.showArms) {
      const th = o.angle,
        arm = r * 0.92;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + arm, cy);
      ctx.stroke();
      const ax = Math.cos((th * Math.PI) / 180),
        ay = -Math.sin((th * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ax * arm, cy + ay * arm);
      ctx.stroke();
      ctx.strokeStyle = theme.bar;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, (-th * Math.PI) / 180, 0, false);
      ctx.stroke();
      if (o.revealed) {
        const md = ((th / 2) * Math.PI) / 180;
        ctx.fillStyle = theme.bar;
        ctx.font = "700 16px " + font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(th + "°", cx + Math.cos(md) * 54, cy - Math.sin(md) * 54);
      }
    }
    ctx.restore();
  },

  Dialog: ProtractorDialog,
});

function drawAngleFacts(
  ctx: CanvasRenderingContext2D,
  theme: import("@/styles/theme").Theme,
  font: string,
  o: { x: number; y: number; w: number; h: number; revealed?: boolean } &
    ProtractorParams,
): void {
  const total = o.fact === "point" ? 360 : 180;
  const given = o.given.slice();
  const x = total - given.reduce((s, a) => s + a, 0);
  ctx.save();
  fillPanel(ctx, o);
  if (o.fact === "triangle") {
    const ax = o.x + o.w * 0.5,
      ay = o.y + 18,
      bx = o.x + 18,
      by = o.y + o.h - 20,
      cxv = o.x + o.w - 18,
      cyv = o.y + o.h - 20;
    ctx.strokeStyle = theme.lineInk;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cxv, cyv);
    ctx.closePath();
    ctx.stroke();
    ctx.font = "700 16px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.lineInk;
    ctx.fillText(given[0] != null ? given[0] + "°" : "?", ax, ay + 26);
    ctx.fillText(given[1] != null ? given[1] + "°" : "?", bx + 30, by - 18);
    ctx.fillStyle = theme.bar;
    ctx.fillText(o.revealed ? x + "°" : "x", cxv - 30, cyv - 18);
    ctx.restore();
    return;
  }
  const O = {
    x: o.x + o.w / 2,
    y: o.fact === "line" ? o.y + o.h * 0.66 : o.y + o.h / 2,
  };
  const up = o.fact === "line" ? O.y - o.y : o.h / 2;
  const r = Math.min(o.w * 0.42, up - 10);
  const all = given.concat([x]);
  const dir = (d: number) => ({
    x: Math.cos((d * Math.PI) / 180),
    y: -Math.sin((d * Math.PI) / 180),
  });
  ctx.strokeStyle = theme.lineInk;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  if (o.fact === "line") {
    ctx.beginPath();
    ctx.moveTo(O.x - r, O.y);
    ctx.lineTo(O.x + r, O.y);
    ctx.stroke();
  }
  let cum = 0;
  const bounds = [0];
  all.forEach((a) => {
    cum += a;
    bounds.push(cum);
  });
  bounds.forEach((b, i) => {
    if (o.fact === "line" && (i === 0 || i === bounds.length - 1)) return;
    const d = dir(b);
    ctx.beginPath();
    ctx.moveTo(O.x, O.y);
    ctx.lineTo(O.x + d.x * r, O.y + d.y * r);
    ctx.stroke();
  });
  ctx.fillStyle = theme.lineInk;
  ctx.beginPath();
  ctx.arc(O.x, O.y, 3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.font = "700 15px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let c2 = 0;
  all.forEach((a, i) => {
    const md = c2 + a / 2;
    c2 += a;
    const d = dir(md);
    const isX = i === all.length - 1;
    ctx.fillStyle = isX ? theme.bar : theme.lineInk;
    ctx.fillText(
      isX ? (o.revealed ? x + "°" : "x") : a + "°",
      O.x + d.x * r * 0.58,
      O.y + d.y * r * 0.58,
    );
  });
  ctx.restore();
}

export default protractorTool;
