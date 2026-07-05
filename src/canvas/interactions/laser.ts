// Laser-pointer gestures. NOT a tool of its own — it's a TOGGLE on the pointer
// (Select) tool: when store.laserMode is on, the select controller delegates
// its pointer events here instead of selecting/moving/lassoing. See select.ts.
//
// WHY: over a video call (learner on their own tablet, or the tutor
// screen-sharing) there's no way to point at something without marking it — on
// touch there isn't even a hover cursor. The laser is a press-drag pointer that
// leaves a short fading trail and writes NOTHING to the document. It also drives
// the OTHER users' cameras (director model): a plain click brings them to a spot
// (if it's off their screen); framing an area — hold Shift, or arm the frame
// toggle on touch — zooms them to fit it, then reverts to pointing.
//
// RENDERING: the LOCAL comet/area draws on the canvas ink layer (works solo and
// over screen-share). REMOTE peers get the trail over Yjs awareness
// (publishLaser) and the view commands over publishLaserFocus; both are applied
// by ui/PresenceLayer.tsx. The pointer's chosen colour (store.laserColor)
// travels WITH the trail, so a peer's laser renders in their own colour.

import { normRect } from "@/board/geometry";
import { publishLaser, publishLaserFocus } from "@/collab/session";
import type { InputCtx, OverlayKit, Pt } from "@/canvas/interactions/types";

/** The laser's default / fallback colour (= LASER_PALETTE[0], ui/constants). */
export const LASER_COLOR = "#ff2b2b";

/** `#rrggbb` → `rgba(r,g,b,a)`, for the translucent tail / area fill. */
function laserRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.replace(/./g, "$&$&") : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** How many recent points form the comet tail. */
const MAX_TRAIL = 8;
/** Screen-px movement past which a press counts as a drag, not a click. */
const DRAG_PX = 4;

/** The awareness payload for a live trail: points + the pointer's colour. */
type TrailWire = { points: Pt[]; color: string } | null;

interface Gesture {
  pid: number;
  /** Framing an area (zoom others) vs pointing (comet). Armed at press by
   *  holding Shift OR the store's `laserFrame` toggle (touch-friendly). */
  frame: boolean;
  /** The laser colour for this gesture (captured at press). */
  color: string;
  /** Press position in screen px, for the click-vs-drag threshold. */
  downSx: number;
  downSy: number;
  /** Comet points in world coords (pointing). */
  trail: Pt[];
  /** Framed area corners in world coords (framing). */
  rect: { x0: number; y0: number; x1: number; y1: number } | null;
  moved: boolean;
}

let g: Gesture | null = null;
/** Per-sender counter so receivers apply each focus command exactly once. */
let focusSeq = 0;

// Trail broadcasts are throttled to one per animation frame, like the cursor.
let pubRaf = 0;
let pubPending: TrailWire = null;
function schedulePublish(trail: TrailWire): void {
  pubPending = trail;
  if (pubRaf) return;
  pubRaf = requestAnimationFrame(() => {
    pubRaf = 0;
    publishLaser(pubPending);
  });
}
function publishNow(trail: TrailWire): void {
  if (pubRaf) {
    cancelAnimationFrame(pubRaf);
    pubRaf = 0;
  }
  pubPending = trail;
  publishLaser(trail);
}

export function laserDown(e: PointerEvent, c: InputCtx): void {
  const pp = c.evPos(e);
  const w = c.toWorld(pp.x, pp.y);
  // Frame an area when Shift is held (laptop) or the frame toggle is armed
  // (touch — see the OptionsStrip button).
  const st = c.store.getState();
  const frame = e.shiftKey || st.laserFrame;
  const color = st.laserColor;
  g = {
    pid: e.pointerId,
    frame,
    color,
    downSx: pp.x,
    downSy: pp.y,
    trail: [w],
    rect: frame ? { x0: w.x, y0: w.y, x1: w.x, y1: w.y } : null,
    moved: false,
  };
  if (!frame) schedulePublish({ points: [w], color }); // start the shared comet
  c.render();
}

export function laserMove(e: PointerEvent, c: InputCtx): void {
  if (!g || e.pointerId !== g.pid) return;
  const pp = c.evPos(e);
  const w = c.toWorld(pp.x, pp.y);
  if (Math.hypot(pp.x - g.downSx, pp.y - g.downSy) >= DRAG_PX) g.moved = true;
  if (g.frame && g.rect) {
    g.rect.x1 = w.x;
    g.rect.y1 = w.y;
  } else {
    g.trail.push(w);
    if (g.trail.length > MAX_TRAIL) g.trail.shift();
    schedulePublish({ points: g.trail.slice(), color: g.color });
  }
  c.render();
}

export function laserUp(e: PointerEvent, c: InputCtx): void {
  if (!g || e.pointerId !== g.pid) return;
  const cur = g;
  g = null;
  if (cur.frame && cur.rect) {
    const r = normRect(cur.rect.x0, cur.rect.y0, cur.rect.x1, cur.rect.y1);
    // Only frame a real area; a tap with no drag does nothing (stays armed).
    if (Math.hypot(r.w, r.h) * c.camera().scale >= DRAG_PX) {
      publishLaserFocus({
        seq: ++focusSeq,
        kind: "rect",
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      });
      // One area framed → revert to normal pointing (disarm the toggle).
      c.store.getState().setLaserFrame(false);
    }
  } else {
    publishNow(null); // clear the shared comet
    // A plain click (no drag) brings the other users to this spot.
    if (!cur.moved) {
      const p = cur.trail[0];
      publishLaserFocus({ seq: ++focusSeq, kind: "point", x: p.x, y: p.y });
    }
  }
  c.render();
}

export function laserCancel(c: InputCtx): void {
  if (!g) return;
  const wasFraming = g.frame;
  g = null;
  if (!wasFraming) publishNow(null);
  c.render();
}

/** Draw the LOCAL comet (or the framed area while shift-dragging) on the ink
 *  layer. Points are world space (the ctx carries the camera transform), so
 *  pixel sizes divide by scale to stay constant on screen. */
export function drawLaserOverlay(kit: OverlayKit): void {
  if (!g) return;
  const ctx = kit.ink;
  const s = kit.camera.scale;
  if (g.frame && g.rect) {
    const r = normRect(g.rect.x0, g.rect.y0, g.rect.x1, g.rect.y1);
    ctx.save();
    ctx.fillStyle = laserRgba(g.color, 0.08);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = g.color;
    ctx.setLineDash([6 / s, 4 / s]);
    ctx.lineWidth = 2 / s;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    return;
  }
  drawComet(ctx, g.trail, s, g.color);
}

/** The comet in the pointer's colour: a translucent tail, a glowing head and a
 *  white centre so the aim point stays crisp on any colour. The remote renderer
 *  (ui/PresenceLayer.tsx) mirrors this shape in SVG. */
function drawComet(
  ctx: CanvasRenderingContext2D,
  t: Pt[],
  s: number,
  color: string,
): void {
  if (t.length === 0) return;
  ctx.save();
  if (t.length > 1) {
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y);
    ctx.strokeStyle = laserRgba(color, 0.35);
    ctx.lineWidth = 4 / s;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  const head = t[t.length - 1];
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 / s;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 6 / s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 1.6 / s, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
}
