// THE VIEWPORT / CAMERA CONTROLLER (T5 in docs/canvas-app-architecture.md).
//
// One home for every way the camera moves: wheel zoom, wheel pan, the pan
// tool, two-finger pinch, and the ZoomCluster buttons all call these. Camera
// writes go through the store, whose subscription drives the canvas redraw —
// callers never render directly.

import { useBoardStore } from "@/board/store";
import { clamp, screenToWorld, MIN_SCALE, MAX_SCALE } from "@/board/geometry";
import type { Camera } from "@/board/types";

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
