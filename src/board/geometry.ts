// Pure coordinate / hit-testing helpers ported from the prototype.
// No globals: callers pass the camera explicitly.

import type { AnyBoardObject, Camera, Stroke } from "@/board/types";
import { id as newId } from "@/board/types";

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 4;

export const clamp = (v: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, v));

/** Screen (canvas-relative px) -> world coordinates. */
export const screenToWorld = (
  cam: Camera,
  sx: number,
  sy: number,
): { x: number; y: number } => ({
  x: (sx - cam.x) / cam.scale,
  y: (sy - cam.y) / cam.scale,
});

/** World coordinates -> screen (canvas-relative px). */
export const worldToScreen = (
  cam: Camera,
  wx: number,
  wy: number,
): { x: number; y: number } => ({
  x: wx * cam.scale + cam.x,
  y: wy * cam.scale + cam.y,
});

/**
 * Top-most object whose padded bounding box contains the world point.
 * Iterates back-to-front so the visually top object wins. Margin 6 (world px).
 */
export const hitTest = (
  objects: AnyBoardObject[],
  wx: number,
  wy: number,
): AnyBoardObject | null => {
  const m = 6;
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (wx >= o.x - m && wx <= o.x + o.w + m && wy >= o.y - m && wy <= o.y + o.h + m) {
      return o;
    }
  }
  return null;
};

// --- resize handles -------------------------------------------------------
// A selected object exposes 8 drag handles (4 corners + 4 edge midpoints) on
// the padded selection box. Corners resize both axes; edges resize one. Handle
// geometry is computed in world space here; the canvas converts to screen for
// constant on-screen size and hit-testing.

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** World-space centre of each resize handle on an object's padded box. */
export const handleCenters = (
  o: { x: number; y: number; w: number; h: number },
  pad: number,
): Record<ResizeHandle, { x: number; y: number }> => {
  const l = o.x - pad;
  const r = o.x + o.w + pad;
  const t = o.y - pad;
  const b = o.y + o.h + pad;
  const mx = o.x + o.w / 2;
  const my = o.y + o.h / 2;
  return {
    nw: { x: l, y: t },
    n: { x: mx, y: t },
    ne: { x: r, y: t },
    e: { x: r, y: my },
    se: { x: r, y: b },
    s: { x: mx, y: b },
    sw: { x: l, y: b },
    w: { x: l, y: my },
  };
};

/**
 * Which resize handle (if any) is within `slop` screen px of the screen point.
 * pad/slop are passed so the caller controls both the box inset (world px) and
 * the click tolerance (screen px).
 */
export const hitTestHandle = (
  cam: Camera,
  o: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number,
  pad: number,
  slop: number,
): ResizeHandle | null => {
  const centers = handleCenters(o, pad);
  for (const h of RESIZE_HANDLES) {
    const c = centers[h];
    const s = worldToScreen(cam, c.x, c.y);
    if (Math.abs(s.x - sx) <= slop && Math.abs(s.y - sy) <= slop) return h;
  }
  return null;
};

// --- stroke geometry (selecting / moving freehand "arcs") -----------------

/** Shortest distance from point (px,py) to the segment a->b. */
const distToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/**
 * Top-most pen stroke whose path passes within (size/2 + margin) of the world
 * point. Iterates back-to-front so the visually top stroke wins; eraser strokes
 * are invisible and never selectable. Margin 6 (world px), matching hitTest.
 */
export const hitTestStroke = (
  strokes: Stroke[],
  wx: number,
  wy: number,
): Stroke | null => {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s.mode === "eraser") continue;
    const thr = s.size / 2 + 6;
    const p = s.points;
    if (p.length === 1) {
      if (Math.hypot(wx - p[0].x, wy - p[0].y) <= thr) return s;
      continue;
    }
    for (let j = 0; j < p.length - 1; j++) {
      if (distToSegment(wx, wy, p[j].x, p[j].y, p[j + 1].x, p[j + 1].y) <= thr) {
        return s;
      }
    }
  }
  return null;
};

/** Bounding box of a stroke (or any sized path) in world coords, padded by
 *  half its line width. */
export const strokeBounds = (s: {
  points: { x: number; y: number }[];
  size: number;
}): Rect => {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const p of s.points) {
    if (p.x < minx) minx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.x > maxx) maxx = p.x;
    if (p.y > maxy) maxy = p.y;
  }
  if (!isFinite(minx)) return { x: 0, y: 0, w: 0, h: 0 };
  const r = s.size / 2;
  return { x: minx - r, y: miny - r, w: maxx - minx + s.size, h: maxy - miny + s.size };
};

// --- geometric eraser (trim pen strokes instead of overlaying pixels) ------
// The eraser used to be a stored "destination-out" overlay stroke: it only
// removed pixels at render time, so a moved pen stroke slid out from under its
// (static) eraser hole. Instead we now bake erasing into geometry -- removing
// the covered points from the pen stroke and splitting it into the surviving
// fragments -- so gaps travel with the stroke and a fully covered stroke
// disappears entirely.

type Pt = { x: number; y: number };

/** Shortest distance from a point to a polyline path. */
const distPointToPath = (px: number, py: number, path: Pt[]): number => {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return Math.hypot(px - path[0].x, py - path[0].y);
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment(px, py, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
    if (d < min) min = d;
  }
  return min;
};

/** Resample a polyline so consecutive points are at most `step` apart. */
const densify = (points: Pt[], step: number): Pt[] => {
  if (points.length < 2 || step <= 0) return points.slice();
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segs = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
};

/**
 * Erase the portions of a pen stroke within `eraserRadius` of the eraser path.
 * Returns the surviving runs of points (one per remaining fragment), or `null`
 * if nothing was touched (so the caller can keep the original stroke untouched).
 * An empty array means the whole stroke was erased and should be deleted. The
 * stroke is resampled first so the eraser can't slip between sparse points.
 */
export const eraseStrokeRuns = (
  points: Pt[],
  eraserPath: Pt[],
  eraserRadius: number,
): Pt[][] | null => {
  const dense = densify(points, Math.max(1, eraserRadius * 0.6));
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  let erasedAny = false;
  for (const p of dense) {
    if (distPointToPath(p.x, p.y, eraserPath) <= eraserRadius) {
      erasedAny = true;
      if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    } else {
      cur.push(p);
    }
  }
  if (cur.length) runs.push(cur);
  return erasedAny ? runs : null;
};

/**
 * Apply one eraser path geometrically to a list of pen strokes: trim covered
 * points, splitting each stroke into its surviving fragments and dropping any
 * stroke that is fully erased. The first fragment keeps the original id so a
 * partially-erased selected stroke stays selected. Fragments inherit the
 * parent's fields (including its z-`order`) via the spread.
 */
export function applyEraser(
  pens: Stroke[],
  eraserPoints: Pt[],
  eraserSize: number,
): Stroke[] {
  const eraserRadius = eraserSize / 2;
  const eb = strokeBounds({ points: eraserPoints, size: eraserSize });
  const out: Stroke[] = [];
  for (const pen of pens) {
    if (!rectsIntersect(strokeBounds(pen), eb)) {
      out.push(pen);
      continue;
    }
    const runs = eraseStrokeRuns(pen.points, eraserPoints, eraserRadius);
    if (runs === null) {
      out.push(pen); // untouched
      continue;
    }
    runs.forEach((run, idx) =>
      out.push({ ...pen, id: idx === 0 ? pen.id : newId(), points: run }),
    );
  }
  return out;
}

// --- rectangle (area / lasso) selection -----------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Build a normalised (non-negative w/h) rect from two corner points. */
export const normRect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rect => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
});

/** Do two axis-aligned rects overlap? */
export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Is the object's bounding box overlapping the area rect? */
export const objectInRect = (
  o: { x: number; y: number; w: number; h: number },
  r: Rect,
): boolean => rectsIntersect(o, r);

/** Does any point of the stroke fall inside the area rect? Half-open on the
 *  right/bottom edges to match rectsIntersect (object) selection semantics. */
export const strokeInRect = (s: Stroke, r: Rect): boolean =>
  s.points.some(
    (p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h,
  );
