// Shared drawing primitives ported from the prototype, adapted to take an
// explicit ctx / theme / font instead of module globals (tctx / css() / FONT).
//
// Each tool's draw(kit, obj) calls these with kit.ctx / kit.theme / kit.font.
// Literal hex colours from the prototype (e.g. "#fff", "#C3D4D2") stay literal;
// only the prototype's css("--x") lookups become theme tokens at the call site.

import type { Theme } from "@/styles/theme";
import { fontFamily, theme } from "@/styles/theme";
import type { Camera, Background } from "@/board/types";

/** Convenience re-export so draw code can `import { FONT }`. */
export const FONT = fontFamily;

// --- number helpers -------------------------------------------------------

/** Split a number into its non-zero place-value parts, e.g. 304 -> [300, 4]. */
export function partition(num: number): number[] {
  const s = String(Math.abs(Math.trunc(num)));
  const arr: number[] = [];
  const L = s.length;
  for (let i = 0; i < L; i++) {
    const d = +s[i];
    if (d !== 0) arr.push(d * Math.pow(10, L - 1 - i));
  }
  if (!arr.length) arr.push(0);
  return arr;
}

/** Round to 6 dp and stringify (kills float noise on tick labels). */
export const fmtNum = (n: number): string => String(Math.round(n * 1e6) / 1e6);

export const to24 = (h: number, m: number): string =>
  String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");

export function to12(h: number, m: number): string {
  const ap = h < 12 ? "am" : "pm";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return hh + ":" + String(m).padStart(2, "0") + " " + ap;
}

// --- path / text helpers --------------------------------------------------

type Corners = { tl: number; tr: number; br: number; bl: number };

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | Corners,
): void {
  const c: Corners = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + c.tl, y);
  ctx.lineTo(x + w - c.tr, y);
  ctx.arcTo(x + w, y, x + w, y + c.tr, c.tr);
  ctx.lineTo(x + w, y + h - c.br);
  ctx.arcTo(x + w, y + h, x + w - c.br, y + h, c.br);
  ctx.lineTo(x + c.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - c.bl, c.bl);
  ctx.lineTo(x, y + c.tl);
  ctx.arcTo(x, y, x + c.tl, y, c.tl);
  ctx.closePath();
}

/** Word-wrap `text` to `maxW` using `font`, preserving explicit newlines. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  font: string,
): string[] {
  ctx.font = font;
  const out: string[] = [];
  (text || "").split("\n").forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    if (!words.length) {
      out.push("");
      return;
    }
    for (const wd of words) {
      const t = line ? line + " " + wd : wd;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = wd;
      } else {
        line = t;
      }
    }
    out.push(line);
  });
  return out.length ? out : [""];
}

// --- offscreen measuring canvas -------------------------------------------
// Module-level scratch context so size helpers can measure text without a live
// render context (mirrors the prototype reusing tctx for measurement).
const measureCanvas: HTMLCanvasElement = document.createElement("canvas");
const measureCtx: CanvasRenderingContext2D = measureCanvas.getContext("2d")!;

/**
 * Width (px) of `text` in `font` (a full CSS font shorthand, e.g. "700 18px "+
 * FONT). Lets a tool's `inputs.fields()` place an answer box after variable-
 * width prompt text without a live render context, mirroring how draw() lays it
 * out. Measured at natural size — fields are in the tool's natural coords.
 */
export function measureTextWidth(text: string, font: string): number {
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Box size for a "note" / problem card containing `text`. */
export function noteSize(text: string): { w: number; h: number } {
  const maxW = 360 - 46;
  const lines = wrapText(measureCtx, text, maxW, "500 17px " + FONT);
  return { w: 360, h: 18 + 24 + lines.length * 24 + 16 };
}

/** Box size for a free-text object of `text` at `size` px. */
export function textSizeOf(text: string, size: number): { w: number; h: number } {
  measureCtx.font = "500 " + size + "px " + FONT;
  const lines = (text || " ").split("\n");
  let w = 0;
  lines.forEach((l) => {
    w = Math.max(w, measureCtx.measureText(l || " ").width);
  });
  return { w: Math.max(w + 6, 24), h: Math.max(lines.length * size * 1.3, size) };
}

// --- panel / digit helpers ------------------------------------------------

/**
 * Fill an object's bounding box with a flat panel colour.
 * Defaults to theme.panel (#FFFFFF). fillPanel does not receive the theme, so
 * the default is the literal equal to theme.panel; pass a colour to override.
 */
export function fillPanel(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number; w: number; h: number },
  color = theme.panel,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(o.x, o.y, o.w, o.h);
}

/** Draw digits of `s` right-aligned at rightX, each `dw` wide, centred at cy. */
export function drawRightNum(
  ctx: CanvasRenderingContext2D,
  s: string | number,
  rightX: number,
  cy: number,
  dw: number,
): void {
  const str = String(s);
  for (let j = str.length - 1, k = 0; j >= 0; j--, k++) {
    ctx.fillText(str[j], rightX - k * dw - dw / 2, cy);
  }
}

/** Draw a stacked fraction n/d centred-left at (x, cy). Returns its width. */
export function drawStackFrac(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  font: string,
  x: number,
  cy: number,
  n: number | string,
  d: number | string,
  size: number,
): number {
  ctx.save();
  ctx.font = "700 " + size + "px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w =
    Math.max(
      ctx.measureText(String(n)).width,
      ctx.measureText(String(d)).width,
    ) + 6;
  ctx.fillStyle = theme.lineInk;
  ctx.fillText(String(n), x + w / 2, cy - size * 0.62);
  ctx.fillText(String(d), x + w / 2, cy + size * 0.62);
  ctx.strokeStyle = theme.lineInk;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + w, cy);
  ctx.stroke();
  ctx.restore();
  return w;
}

// --- stroke renderers -----------------------------------------------------

export function strokeStyleFor(
  ctx: CanvasRenderingContext2D,
  s: { mode: "pen" | "eraser"; color: string; size: number },
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size;
  if (s.mode === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
  }
}

export function drawStrokeFull(
  ctx: CanvasRenderingContext2D,
  s: { mode: "pen" | "eraser"; color: string; size: number; points: { x: number; y: number }[] },
): void {
  const p = s.points;
  strokeStyleFor(ctx, s);
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0].x, p[0].y, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2;
      const my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

// --- grid renderer --------------------------------------------------------

/**
 * Draw the paper grid for the current camera. Assumes the camera transform is
 * ALREADY applied to ctx (as in the prototype's renderBack), so it draws in
 * world space. W/H are the CSS-pixel viewport size.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  opts: { camera: Camera; W: number; H: number; background: Background; theme: Theme },
): void {
  const { camera, W, H, background, theme } = opts;
  if (background === "blank") return;
  let gap = 30;
  while (gap * camera.scale < 14) gap *= 2;
  const x0 = -camera.x / camera.scale;
  const x1 = (W - camera.x) / camera.scale;
  const y0 = -camera.y / camera.scale;
  const y1 = (H - camera.y) / camera.scale;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1 / camera.scale;
  ctx.beginPath();
  if (background === "squared") {
    for (let x = Math.floor(x0 / gap) * gap; x <= x1; x += gap) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
  }
  for (let y = Math.floor(y0 / gap) * gap; y <= y1; y += gap) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}
