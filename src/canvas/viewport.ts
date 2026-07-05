// THE VIEWPORT / CAMERA CONTROLLER (T5 in docs/canvas-app-architecture.md).
//
// One home for every way the camera moves: wheel zoom, wheel pan, the pan
// tool, two-finger pinch, and the ZoomCluster buttons all call these. Camera
// writes go through the store, whose subscription drives the canvas redraw —
// callers never render directly.

import { useBoardStore } from "@/board/store";
import {
  clamp,
  screenToWorld,
  worldToScreen,
  MIN_SCALE,
  MAX_SCALE,
} from "@/board/geometry";
import type { Camera } from "@/board/types";
import type { LaserFocus } from "@/collab/collabStore";

/** A screen-space point (canvas-relative CSS px). */
export interface Pt {
  x: number;
  y: number;
}

/** Apply the camera transform (including devicePixelRatio) to a 2D context. */
export function applyCam(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
): void {
  ctx.setTransform(
    cam.scale * dpr,
    0,
    0,
    cam.scale * dpr,
    cam.x * dpr,
    cam.y * dpr,
  );
}

/**
 * Zoom by `factor`, keeping the screen point (cx, cy) fixed, clamped to
 * [MIN_SCALE, MAX_SCALE].
 */
export function zoomAt(factor: number, cx: number, cy: number): void {
  const { camera, setCamera } = useBoardStore.getState();
  const s = clamp(camera.scale * factor, MIN_SCALE, MAX_SCALE);
  const f = s / camera.scale;
  setCamera({
    scale: s,
    x: cx - (cx - camera.x) * f,
    y: cy - (cy - camera.y) * f,
  });
}

/** Translate the camera by a screen-space delta. */
export function panBy(dx: number, dy: number): void {
  const { camera, setCamera } = useBoardStore.getState();
  setCamera({ x: camera.x + dx, y: camera.y + dy });
}

// --- laser "guide my view" (director model) ---------------------------------
// A peer's laser can drive OUR camera: a click recentres a hidden spot into
// view; a shift-drag area zooms us to fit it. The pointer never moves their own
// view — only the receivers'. Size comes from the live #stage box (the canvas
// host sizes to it), so this needs no wiring from BoardCanvas.

/** The stage's CSS pixel size, or null if it isn't mounted yet. */
function stageSize(): { W: number; H: number } | null {
  const el = document.getElementById("stage");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { W: r.width, H: r.height };
}

/** Is a world point currently on screen, inset by `marginPx` from the edges?
 *  Unknown size (stage not mounted) counts as visible — never move blindly. */
export function isWorldPointVisible(
  w: { x: number; y: number },
  marginPx = 0,
): boolean {
  const sz = stageSize();
  if (!sz) return true;
  const { camera } = useBoardStore.getState();
  const s = worldToScreen(camera, w.x, w.y);
  return (
    s.x >= marginPx &&
    s.x <= sz.W - marginPx &&
    s.y >= marginPx &&
    s.y <= sz.H - marginPx
  );
}

/** Recentre the camera on a world point, keeping the current zoom. */
export function centerOnWorld(w: { x: number; y: number }): void {
  const sz = stageSize();
  if (!sz) return;
  const { camera, setCamera } = useBoardStore.getState();
  setCamera({
    x: sz.W / 2 - w.x * camera.scale,
    y: sz.H / 2 - w.y * camera.scale,
  });
}

/** Zoom + pan so a world rect fits the viewport with a border margin, clamped
 *  to the allowed scale range. */
export function zoomToWorldRect(
  r: { x: number; y: number; w: number; h: number },
  padFrac = 0.12,
): void {
  const sz = stageSize();
  if (!sz || r.w <= 0 || r.h <= 0) return;
  const { setCamera } = useBoardStore.getState();
  const fit = Math.min(sz.W / r.w, sz.H / r.h) * (1 - padFrac);
  const s = clamp(fit, MIN_SCALE, MAX_SCALE);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  setCamera({ scale: s, x: sz.W / 2 - cx * s, y: sz.H / 2 - cy * s });
}

/**
 * Apply a received laser focus to OUR camera. A point only recentres when it's
 * off-screen (or near the edge) — an already-visible spot is left alone, so a
 * shared gesture never yanks a viewer who can already see it. An area always
 * zooms to fit (that's the point of framing it).
 */
export function applyLaserFocus(f: LaserFocus): void {
  if (f.kind === "rect" && f.w != null && f.h != null) {
    zoomToWorldRect({ x: f.x, y: f.y, w: f.w, h: f.h });
  } else if (!isWorldPointVisible({ x: f.x, y: f.y }, 48)) {
    centerOnWorld({ x: f.x, y: f.y });
  }
}

// --- two-finger pinch --------------------------------------------------------

export interface Pinch {
  startDist: number;
  startScale: number;
  /** The world point under the fingers' midpoint at gesture start; kept under
   *  the (moving) midpoint throughout, so pinch zooms AND pans at once. */
  worldMid: Pt;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function startPinch(p1: Pt, p2: Pt): Pinch {
  const { camera } = useBoardStore.getState();
  const m = mid(p1, p2);
  return {
    startDist: dist(p1, p2),
    startScale: camera.scale,
    worldMid: screenToWorld(camera, m.x, m.y),
  };
}

export function updatePinch(g: Pinch, p1: Pt, p2: Pt): void {
  const { setCamera } = useBoardStore.getState();
  const m = mid(p1, p2);
  const s = clamp(
    (g.startScale * dist(p1, p2)) / g.startDist,
    MIN_SCALE,
    MAX_SCALE,
  );
  setCamera({
    scale: s,
    x: m.x - g.worldMid.x * s,
    y: m.y - g.worldMid.y * s,
  });
}
