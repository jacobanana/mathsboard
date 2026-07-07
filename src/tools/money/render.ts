// The Money tool's painter — flat, modern 2D vector coins and notes.
//
// No 3D: each piece is drawn straight in screen space as clean vector shapes —
// a filled disc / rounded rectangle with a soft top-lit gradient, a crisp rim,
// a subtle sheen and a soft drop shadow, plus the denomination in a rounded
// face font. Coins and notes are sized from their REAL millimetre dimensions
// (see currencies.ts) so denominations keep true relative sizes (the US dime
// really is smaller than the penny). A small per-piece rotation (the piece's
// `spin`) keeps a scattered pile looking natural.
//
// Flat vector drawing is cheap, so every piece is drawn live each frame (no
// sprite cache); the placing "pop" animation is a scale + drop, not a tumble.

import {
  getCurrency,
  getDenom,
  metricsFor,
  type Currency,
  type Denomination,
} from "@/tools/money/currencies";

// --- colour helpers ---------------------------------------------------------

type Rgb = [number, number, number];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
const rgb = (c: Rgb) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
/** Multiply toward white (k>1) or black (k<1), clamped. */
const shade = (c: Rgb, k: number): string =>
  rgb([clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]);
/** Readable ink (dark on light, near-white on dark). */
function inkFor(c: Rgb): Rgb {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return lum > 150 ? [45, 52, 50] : [250, 250, 247];
}

const FONT = "'Segoe UI Rounded', ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif";

/** Set a bold face font that fits `text` within `maxW` (starting at `sizePx`). */
function fitFont(ctx: CanvasRenderingContext2D, text: string, sizePx: number, maxW: number): void {
  let fs = sizePx;
  ctx.font = `800 ${fs}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    fs *= maxW / w;
    ctx.font = `800 ${fs}px ${FONT}`;
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- one coin (flat vector) -------------------------------------------------

function drawCoin(
  ctx: CanvasRenderingContext2D,
  denom: Denomination,
  cx: number,
  cy: number,
  r: number,
  rot: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (scale !== 1) ctx.scale(scale, scale);
  const base = hexToRgb(denom.color);

  // Soft drop shadow + top-lit body gradient.
  ctx.save();
  ctx.shadowColor = "rgba(30,40,38,0.22)";
  ctx.shadowBlur = r * 0.22;
  ctx.shadowOffsetY = r * 0.14;
  const body = ctx.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, shade(base, 1.14));
  body.addColorStop(1, shade(base, 0.9));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();

  // Crisp milled rim just inside the edge.
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = shade(base, 0.78);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, 2 * Math.PI);
  ctx.stroke();

  // Fluid top-left sheen, clipped to the disc.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.93, 0, 2 * Math.PI);
  ctx.clip();
  const sheen = ctx.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.05, -r * 0.15, -r * 0.2, r * 1.35);
  sheen.addColorStop(0, "rgba(255,255,255,0.4)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.08)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();

  // Face contents rotate with the coin so a pile reads naturally.
  ctx.rotate(rot);
  if (denom.coreColor) {
    // Bimetallic: an inner disc in the second metal.
    const cb = hexToRgb(denom.coreColor);
    const core = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6);
    core.addColorStop(0, shade(cb, 1.12));
    core.addColorStop(1, shade(cb, 0.9));
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, 2 * Math.PI);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.lineWidth = r * 0.03;
    ctx.strokeStyle = shade(cb, 0.82);
    ctx.stroke();
  } else {
    // Single metal: a fine inner ring for a coined feel.
    ctx.lineWidth = r * 0.03;
    ctx.strokeStyle = shade(base, 0.86);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.74, 0, 2 * Math.PI);
    ctx.stroke();
  }

  const ink = inkFor(hexToRgb(denom.coreColor ?? denom.color));
  ctx.fillStyle = rgb(ink);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, denom.face, r * 1.1, r * 1.25);
  ctx.fillText(denom.face, 0, r * 0.02);
  ctx.restore();
}

// --- one note (flat vector) -------------------------------------------------

function drawBill(
  ctx: CanvasRenderingContext2D,
  denom: Denomination,
  cx: number,
  cy: number,
  w: number,
  rot: number,
  scale: number,
): void {
  const h = w * ((denom.heightMm ?? denom.sizeMm * 0.5) / denom.sizeMm);
  ctx.save();
  ctx.translate(cx, cy);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.rotate(rot);
  const base = hexToRgb(denom.color);
  const rx = w / 2;
  const ry = h / 2;
  const rad = Math.min(rx, ry) * 0.34;

  // Soft drop shadow + top-lit body.
  ctx.save();
  ctx.shadowColor = "rgba(30,40,38,0.24)";
  ctx.shadowBlur = w * 0.05;
  ctx.shadowOffsetY = h * 0.08;
  const body = ctx.createLinearGradient(0, -ry, 0, ry);
  body.addColorStop(0, shade(base, 1.1));
  body.addColorStop(1, shade(base, 0.9));
  roundRectPath(ctx, -rx, -ry, w, h, rad);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();

  // Inner frame.
  ctx.lineWidth = Math.max(1, h * 0.028);
  ctx.strokeStyle = shade(base, 1.28);
  roundRectPath(ctx, -rx * 0.9, -ry * 0.8, w * 0.9, h * 0.8, rad * 0.7);
  ctx.stroke();

  // Portrait medallion on the left.
  const px = -rx * 0.58;
  const pr = ry * 0.52;
  const port = ctx.createLinearGradient(px, -pr, px, pr);
  port.addColorStop(0, shade(base, 1.22));
  port.addColorStop(1, shade(base, 1.04));
  ctx.beginPath();
  ctx.arc(px, 0, pr, 0, 2 * Math.PI);
  ctx.fillStyle = port;
  ctx.fill();
  ctx.lineWidth = h * 0.02;
  ctx.strokeStyle = shade(base, 0.84);
  ctx.stroke();

  // Value on the right.
  const ink = inkFor(base);
  ctx.fillStyle = rgb(ink);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, denom.face, h * 0.52, w * 0.52);
  ctx.fillText(denom.face, rx * 0.3, 0);

  // Fluid sheen across the top, clipped to the note.
  ctx.save();
  roundRectPath(ctx, -rx, -ry, w, h, rad);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, -ry, 0, ry * 0.3);
  sheen.addColorStop(0, "rgba(255,255,255,0.24)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-rx, -ry, w, h);
  ctx.restore();

  ctx.restore();
}

// --- the stage --------------------------------------------------------------

export interface RenderPiece {
  key: string;
  denomId: string;
  /** Normalised position in mat space [0..1]. */
  x: number;
  y: number;
  spin: number;
  /** Present only while popping in: a falling offset + a grow scale. */
  anim?: { dyPx: number; scale: number };
}

export interface HitRegion {
  key: string;
  cx: number;
  cy: number;
  r: number;
}

export interface StageView {
  currency: Currency["code"];
  cssW: number;
  cssH: number;
  pieces: RenderPiece[];
}

/** Paint a mat of pieces. Returns hit regions (topmost last) so the component
 *  can hit-test a click to the frontmost piece. */
export function paintStage(canvas: HTMLCanvasElement, view: StageView): HitRegion[] {
  const { cssW, cssH } = view;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cur = getCurrency(view.currency);
  const m = metricsFor(cur, Math.min(cssW, cssH));
  const hits: HitRegion[] = [];

  for (const p of view.pieces) {
    const denom = getDenom(p.denomId);
    if (!denom) continue;
    const cx = p.x * cssW;
    const cy = p.y * cssH + (p.anim?.dyPx ?? 0);
    const scale = p.anim?.scale ?? 1;
    if (denom.kind === "coin") drawCoin(ctx, denom, cx, cy, m.coinR(denom), p.spin, scale);
    else drawBill(ctx, denom, cx, cy, m.billW(denom), p.spin, scale);
    hits.push({ key: p.key, cx, cy, r: m.hitR(denom) });
  }
  return hits;
}

/** Draw a single resting piece filling a small canvas — used for tray chips. */
export function drawThumb(canvas: HTMLCanvasElement, denomId: string): void {
  const denom = getDenom(denomId);
  if (!denom) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 46;
  const cssH = canvas.clientHeight || 46;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (denom.kind === "coin") drawCoin(ctx, denom, cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.4, 0, 1);
  else drawBill(ctx, denom, cssW / 2, cssH / 2, cssW * 0.82, 0, 1);
}
