// The Money tool's software-3D painter — the same Canvas-2D technique the dice
// widget uses (rotate the mesh by a quaternion, cull back faces, painter-sort,
// Lambert-shade, print the label in the face plane, one glossy highlight on
// top), generalised from a single die to a pile of coins and notes.
//
// Coins and notes are modelled at unit scale (see geometry.ts) and drawn at a
// pixel size derived from their REAL millimetre dimensions, so denominations
// keep their true relative sizes (the US dime really is smaller than the penny).
// Static pieces are blitted from an offscreen sprite cache keyed by
// (denomId · size · spin); only pieces mid-drop are drawn live.

import {
  add,
  dot,
  mul,
  normalize,
  rotateVec,
  type Quat,
  type Vec3,
} from "@/tools/dice/geometry";
import {
  getCurrency,
  getDenom,
  type Currency,
  type Denomination,
} from "@/tools/money/currencies";
import { billMesh, coinMesh, pieceQuat, type Mesh } from "@/tools/money/geometry";

// --- colour helpers (ported from the dice painter) --------------------------

type Rgb = [number, number, number];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
const rgb = (c: Rgb) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const shade = (c: Rgb, k: number): string =>
  rgb([clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]);
const mulc = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
/** Readable ink (dark on light, near-white on dark). */
function inkFor(c: Rgb): Rgb {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return lum > 150 ? [40, 46, 44] : [250, 250, 246];
}

const LIGHT = normalize([-0.32, 0.5, 0.78]);
const FONT = "'Segoe UI', system-ui, sans-serif";

// --- pixel scale (real mm -> px, per currency & mat size) -------------------

export interface Metrics {
  /** Projection unit for a coin (its radius, px). */
  coinR: (d: Denomination) => number;
  /** Projection unit for a note (its long side, px). */
  billW: (d: Denomination) => number;
  /** Hit-test radius (px). */
  hitR: (d: Denomination) => number;
}

/** Build the mm->px scale for a currency given the mat pixel size. Coins scale
 *  linearly by diameter; notes are compressed (2–3× a coin) so a €500 doesn't
 *  dwarf everything. */
export function metricsFor(cur: Currency, matMin: number): Metrics {
  const coins = cur.denominations.filter((d) => d.kind === "coin");
  const bills = cur.denominations.filter((d) => d.kind === "bill");
  const maxCoinMm = Math.max(...coins.map((d) => d.sizeMm));
  const minBillMm = bills.length ? Math.min(...bills.map((d) => d.sizeMm)) : 1;
  const maxBillMm = bills.length ? Math.max(...bills.map((d) => d.sizeMm)) : 1;
  const unit = clamp(matMin * 0.12, 13, 48); // target radius of the biggest coin
  const coinR = (d: Denomination) => unit * (d.sizeMm / maxCoinMm);
  const billW = (d: Denomination) => {
    const norm = maxBillMm > minBillMm ? (d.sizeMm - minBillMm) / (maxBillMm - minBillMm) : 0;
    return unit * (4.0 + 1.4 * norm);
  };
  const hitR = (d: Denomination) => (d.kind === "coin" ? coinR(d) : billW(d) * 0.42);
  return { coinR, billW, hitR };
}

// --- one piece --------------------------------------------------------------

function drawPiece(
  ctx: CanvasRenderingContext2D,
  denom: Denomination,
  q: Quat,
  cx: number,
  cy: number,
  unitPx: number,
): void {
  const isCoin = denom.kind === "coin";
  const mesh: Mesh = isCoin ? coinMesh() : billMesh(denom.sizeMm, denom.heightMm ?? denom.sizeMm * 0.5);
  const PERSP = 0.2;
  const project = (v: Vec3) => {
    const f = 1 + v[2] * PERSP;
    return { x: cx + v[0] * unitPx * f, y: cy - v[1] * unitPx * f };
  };
  const base = hexToRgb(denom.color);
  const edge = shade(base, 0.42);
  const lineW = Math.max(0.5, unitPx * 0.015);

  const front = mesh.faces
    .map((face) => ({ face, n: rotateVec(q, face.normal), zc: rotateVec(q, face.center)[2] }))
    .filter((d) => d.n[2] > 0.02)
    .sort((a, b) => a.zc - b.zc);

  for (const { face, n } of front) {
    const pts = face.indices.map((i) => project(rotateVec(q, mesh.vertices[i])));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    const lam = Math.max(0, dot(n, LIGHT));
    const fb = face.kind === "top" ? base : mulc(base, 0.82);
    ctx.fillStyle = shade(fb, 0.6 + 0.5 * lam);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = lineW;
    ctx.strokeStyle = edge;
    ctx.stroke();
    if (face.kind === "top") drawFace(ctx, denom, face, q, project, lam);
  }
}

/** Print the face design (label, bimetallic core, note motif) in the face
 *  plane, exactly like the dice painter draws its numbers. */
function drawFace(
  ctx: CanvasRenderingContext2D,
  denom: Denomination,
  face: Mesh["faces"][number],
  q: Quat,
  project: (v: Vec3) => { x: number; y: number },
  lam: number,
): void {
  const s = face.inradius ?? 0.8;
  const cRot = rotateVec(q, face.center);
  const o = project(cRot);
  const ue = project(add(cRot, mul(rotateVec(q, face.u), s)));
  const de = project(add(cRot, mul(rotateVec(q, face.v), -s)));
  ctx.save();
  ctx.transform(ue.x - o.x, ue.y - o.y, de.x - o.x, de.y - o.y, o.x, o.y);
  const R = 10;
  ctx.scale(1 / R, 1 / R);
  const topShade = 0.72 + 0.4 * lam;
  const isCoin = denom.kind === "coin";

  if (isCoin && denom.coreColor) {
    // Bimetallic: a lighter inner disc under the number.
    ctx.beginPath();
    ctx.arc(0, 0, 0.62 * R, 0, 2 * Math.PI);
    ctx.fillStyle = shade(hexToRgb(denom.coreColor), topShade);
    ctx.fill();
  }
  if (!isCoin) {
    // Note: a subtle inner frame + a portrait window on the left so it reads as
    // a banknote, then the value large on the right.
    const exX = (0.5 / s) * R; // the note's long half in this scaled space
    const base = hexToRgb(denom.color);
    ctx.lineWidth = 0.06 * R;
    ctx.strokeStyle = shade(base, 1.18);
    roundRect(ctx, -0.9 * exX, -0.82 * R, 1.8 * exX, 1.64 * R, 0.18 * R);
    ctx.stroke();
    ctx.fillStyle = shade(base, 1.12);
    ctx.beginPath();
    ctx.ellipse(-0.55 * exX, 0, 0.26 * exX, 0.55 * R, 0, 0, 2 * Math.PI);
    ctx.fill();
  }

  const ink = inkFor(hexToRgb(denom.coreColor ?? denom.color));
  ctx.fillStyle = rgb(ink);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = (isCoin ? 1.15 : 1.35) * R;
  ctx.font = `800 ${fs}px ${FONT}`;
  const maxW = (isCoin ? 1.55 : 2.4) * R;
  const w = ctx.measureText(denom.face).width;
  if (w > maxW) {
    fs *= maxW / w;
    ctx.font = `800 ${fs}px ${FONT}`;
  }
  const dx = isCoin ? 0 : 0.55 * ((0.5 / s) * R); // notes: value on the right
  ctx.fillText(denom.face, dx, 0.02 * R);
  ctx.restore();
}

function roundRect(
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

// --- sprite cache (static pieces) -------------------------------------------

const SPRITES = new Map<string, HTMLCanvasElement>();

function sprite(denom: Denomination, unitPx: number, spin: number, dpr: number): HTMLCanvasElement {
  const sizeBucket = Math.round(unitPx);
  const spinBucket = Math.round(spin * 12);
  const key = `${denom.id}|${sizeBucket}|${spinBucket}|${dpr}`;
  let cv = SPRITES.get(key);
  if (cv) return cv;
  const isCoin = denom.kind === "coin";
  // Generous bounding box; the tilt tips the piece so it grows a little.
  const halfW = (isCoin ? unitPx : unitPx * 0.62) * 1.18 + 3;
  const halfH = (isCoin ? unitPx : unitPx * 0.5) * 1.25 + 3;
  cv = document.createElement("canvas");
  cv.width = Math.ceil(2 * halfW * dpr);
  cv.height = Math.ceil(2 * halfH * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPiece(ctx, denom, pieceQuat(isCoin ? "coin" : "bill", spin), halfW, halfH, unitPx);
  (cv as HTMLCanvasElement & { _hw: number; _hh: number })._hw = halfW;
  (cv as HTMLCanvasElement & { _hw: number; _hh: number })._hh = halfH;
  SPRITES.set(key, cv);
  return cv;
}

// --- the stage --------------------------------------------------------------

export interface RenderPiece {
  key: string;
  denomId: string;
  /** Normalised position in mat space [0..1]. */
  x: number;
  y: number;
  spin: number;
  /** Present only while dropping in: the live orientation + a falling offset. */
  anim?: { quat: Quat; dyPx: number };
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

/** Paint a mat of pieces. Returns hit regions (largest last = topmost) so the
 *  component can hit-test a click to the frontmost piece. */
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
    const isCoin = denom.kind === "coin";
    const unitPx = isCoin ? m.coinR(denom) : m.billW(denom);
    const cx = p.x * cssW;
    const cy = p.y * cssH + (p.anim?.dyPx ?? 0);
    if (p.anim) {
      drawPiece(ctx, denom, p.anim.quat, cx, cy, unitPx);
    } else {
      const sp = sprite(denom, unitPx, p.spin, dpr);
      const hw = (sp as HTMLCanvasElement & { _hw: number })._hw;
      const hh = (sp as HTMLCanvasElement & { _hh: number })._hh;
      ctx.drawImage(sp, cx - hw, cy - hh, sp.width / dpr, sp.height / dpr);
    }
    hits.push({ key: p.key, cx, cy, r: m.hitR(denom) });
  }

  // One glossy top-light over the drawn pieces (source-atop clips to them).
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, "rgba(255,255,255,0.22)");
  g.addColorStop(0.5, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.restore();

  return hits;
}

/** Draw a single resting piece filling a small canvas — used for tray chips. */
export function drawThumb(canvas: HTMLCanvasElement, denomId: string): void {
  const denom = getDenom(denomId);
  if (!denom) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 44;
  const cssH = canvas.clientHeight || 44;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const isCoin = denom.kind === "coin";
  const unitPx = isCoin ? cssH * 0.42 : cssW * 0.42;
  drawPiece(ctx, denom, pieceQuat(isCoin ? "coin" : "bill", 0), cssW / 2, cssH / 2, unitPx);
}
