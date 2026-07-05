// Pure geometry for the shape tool: kind taxonomy, drag-to-create derivation,
// vertex maths (interior angles, angle-arm sweeps, rotation) and normalisation.
// No canvas, no store — fully unit-testable.
//
// COORDINATE MODEL. A shape object stores its geometry as `pts` in NATURAL
// coordinates: the bounding box of the points sits at (0,0) with extent
// (nw, nh). The scene renderer uniformly scales the natural box into the
// object's stored box (w/h), exactly like every other canvas tool, so a
// handle-resize scales the whole shape. Vertex edits re-normalise: the moved
// point set is rebased so its bbox is the new natural box AND the new stored
// box (scale folds back to 1) — see `renormalize`.

export interface Pt {
  x: number;
  y: number;
}

/** Every drawable shape kind, exhaustively. */
export type ShapeKind =
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "triangle"
  | "polygon"
  | "curve"
  | "angle";

export const SHAPE_KINDS: ShapeKind[] = [
  "line",
  "arrow",
  "rect",
  "ellipse",
  "triangle",
  "polygon",
  "curve",
  "angle",
];

/** Kinds with an interior, i.e. that can carry a background fill. */
export const isClosed = (k: ShapeKind): boolean =>
  k === "rect" || k === "ellipse" || k === "triangle" || k === "polygon";

/** Kinds whose geometry is a point list (editable vertices). */
export const isPointKind = (k: ShapeKind): boolean =>
  k !== "rect" && k !== "ellipse";

/** Kinds where vertex handles REPLACE the box resize handles (a 2-4 point
 *  path has no meaningful box; its points are its resize UI). */
export const vertexOnlyResize = (k: ShapeKind): boolean =>
  k === "line" || k === "arrow" || k === "curve" || k === "angle";

/** Kinds that show angle measures when `showAngles` is on. */
export const hasAngles = (k: ShapeKind): boolean =>
  k === "triangle" || k === "polygon" || k === "angle";

const deg = (rad: number): number => (rad * 180) / Math.PI;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Positive modulo into [0, m). */
export const posMod = (v: number, m: number): number => ((v % m) + m) % m;

/** Rotate `p` around `c` by `d` degrees (canvas coords: +d rotates clockwise
 *  on screen, since y points down). */
export function rotateAround(p: Pt, c: Pt, d: number): Pt {
  const a = rad(d);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: c.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: c.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** Vertices of a regular `sides`-gon inscribed in the ellipse filling a w×h
 *  box, first vertex at the top. Local coords within the box (NOT yet
 *  bbox-normalised — pass through renormalize for storage). */
export function regularPolygonPts(sides: number, w: number, h: number): Pt[] {
  const n = Math.max(3, Math.round(sides));
  const cx = w / 2;
  const cy = h / 2;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push({ x: cx + (w / 2) * Math.cos(a), y: cy + (h / 2) * Math.sin(a) });
  }
  return out;
}

/**
 * Rebase a point set so its bounding box sits at (0,0): returns the shifted
 * points, the natural box (extents floored at 1 so the renderer's
 * width-derived uniform scale never divides by zero on a perfectly
 * horizontal/vertical line) and the world offset that was removed.
 */
export function renormalize(pts: Pt[]): {
  pts: Pt[];
  nw: number;
  nh: number;
  ox: number;
  oy: number;
} {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const p of pts) {
    if (p.x < minx) minx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.x > maxx) maxx = p.x;
    if (p.y > maxy) maxy = p.y;
  }
  if (!isFinite(minx)) return { pts: [], nw: 1, nh: 1, ox: 0, oy: 0 };
  return {
    pts: pts.map((p) => ({ x: p.x - minx, y: p.y - miny })),
    nw: Math.max(maxx - minx, 1),
    nh: Math.max(maxy - miny, 1),
    ox: minx,
    oy: miny,
  };
}

/**
 * Interior angle (degrees, 0-180) at every vertex of a closed polygon given
 * in path order: the angle between the two edges meeting there. Uniform
 * scaling preserves angles, so these labels stay correct after any resize.
 */
export function interiorAngles(pts: Pt[]): number[] {
  const n = pts.length;
  return pts.map((v, i) => {
    const p = pts[(i - 1 + n) % n];
    const q = pts[(i + 1) % n];
    const a = { x: p.x - v.x, y: p.y - v.y };
    const b = { x: q.x - v.x, y: q.y - v.y };
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la === 0 || lb === 0) return 0;
    const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (la * lb)));
    return deg(Math.acos(cos));
  });
}

/**
 * The angle tool's measure: the sweep from ray V→A to ray V→B, opening
 * ANTICLOCKWISE on screen (protractor convention), in [0, 360). Dragging the
 * B arm through the A arm goes straight/reflex continuously.
 */
export function angleSweepDeg(v: Pt, a: Pt, b: Pt): number {
  const angA = Math.atan2(a.y - v.y, a.x - v.x);
  const angB = Math.atan2(b.y - v.y, b.x - v.x);
  return posMod(deg(angA - angB), 360);
}

/** Arm-B position that makes the angle read exactly `target` degrees,
 *  keeping B's arm length. (See angleSweepDeg for the sweep convention.) */
export function armForAngle(v: Pt, a: Pt, b: Pt, target: number): Pt {
  const current = angleSweepDeg(v, a, b);
  return rotateAround(b, v, current - target);
}

// --- angle snapping (drag a vertex, angles click onto teaching values) ------

/**
 * The "nice" angle a dragged measure should magnetise to, or null: multiples
 * of 15° within 2.5°, with a stronger 5° magnet on 90° — right angles are the
 * value children set most, so they must be the easiest to hit.
 */
export function niceAngleTarget(a: number): number | null {
  if (Math.abs(a - 90) <= 5) return 90;
  const nearest = Math.round(a / 15) * 15;
  if (nearest > 0 && nearest < 360 && Math.abs(a - nearest) <= 2.5) {
    return nearest;
  }
  return null;
}

/** Interior angle (degrees) at vertex `i` of a closed polygon. */
export function angleAtVertex(pts: Pt[], i: number): number {
  return interiorAngles(pts)[i];
}

/**
 * Magnetic angle snap for a dragged polygon vertex: when the interior angle
 * at `i` is close to a nice value (see niceAngleTarget), return the nearest
 * point for `pts[i]` that makes the angle EXACT, else null.
 *
 * By the inscribed-angle theorem the locus of points seeing the fixed chord
 * (the two neighbouring vertices) under a given angle is a circular arc
 * through them; the snapped position is the dragged point projected onto
 * that circle (both candidate centres are tried; the one that actually
 * yields the target angle and stays closest wins).
 */
export function snapVertexAngle(pts: Pt[], i: number): Pt | null {
  const n = pts.length;
  if (n < 3) return null;
  const P = pts[i];
  const A = pts[(i - 1 + n) % n];
  const B = pts[(i + 1) % n];
  const current = angleAtVertex(pts, i);
  const target = niceAngleTarget(current);
  if (target == null || Math.abs(current - target) < 1e-9) {
    return target == null ? null : P;
  }
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  if (L < 1e-9) return null;
  const t = rad(target);
  const R = L / (2 * Math.sin(t));
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const nx = -(B.y - A.y) / L;
  const ny = (B.x - A.x) / L;
  const d = L / (2 * Math.tan(t));
  let best: Pt | null = null;
  let bestErr = Infinity;
  let bestDist = Infinity;
  for (const s of [1, -1]) {
    const c = { x: M.x + nx * d * s, y: M.y + ny * d * s };
    const vx = P.x - c.x;
    const vy = P.y - c.y;
    const vl = Math.hypot(vx, vy);
    if (vl < 1e-9) continue;
    const cand = { x: c.x + (vx / vl) * Math.abs(R), y: c.y + (vy / vl) * Math.abs(R) };
    const probe = [...pts];
    probe[i] = cand;
    const err = Math.abs(angleAtVertex(probe, i) - target);
    const dist = Math.hypot(cand.x - P.x, cand.y - P.y);
    if (err < bestErr - 1e-6 || (Math.abs(err - bestErr) <= 1e-6 && dist < bestDist)) {
      best = cand;
      bestErr = err;
      bestDist = dist;
    }
  }
  return best && bestErr < 0.5 ? best : null;
}

/**
 * Rebuild a triangle from its two base angles (degrees), keeping the base
 * edge `bl`→`br` fixed and placing the apex on the same side as `apexRef`.
 * The parametric edit behind the triangle dialog: set 90° and you have an
 * exact right angle at the left base vertex.
 */
export function apexFromBaseAngles(
  bl: Pt,
  br: Pt,
  apexRef: Pt,
  leftDeg: number,
  rightDeg: number,
): Pt {
  const L = Math.hypot(br.x - bl.x, br.y - bl.y);
  const a = rad(leftDeg);
  const b = rad(rightDeg);
  // Law of sines: |bl→apex| = L · sin(right) / sin(left + right).
  const arm = (L * Math.sin(b)) / Math.sin(a + b);
  const ux = (br.x - bl.x) / L;
  const uy = (br.y - bl.y) / L;
  // The apex sits at the base direction rotated by ±left; pick the candidate
  // on apexRef's side of the base line.
  const side = Math.sign(
    (br.x - bl.x) * (apexRef.y - bl.y) - (br.y - bl.y) * (apexRef.x - bl.x),
  ) || -1;
  for (const s of [1, -1]) {
    const dx = ux * Math.cos(a * s) - uy * Math.sin(a * s);
    const dy = ux * Math.sin(a * s) + uy * Math.cos(a * s);
    const cand = { x: bl.x + dx * arm, y: bl.y + dy * arm };
    const candSide = Math.sign(
      (br.x - bl.x) * (cand.y - bl.y) - (br.y - bl.y) * (cand.x - bl.x),
    );
    if (candSide === side) return cand;
  }
  // Degenerate reference (apex on the base line): default above the base.
  const dx = ux * Math.cos(-a) - uy * Math.sin(-a);
  const dy = ux * Math.sin(-a) + uy * Math.cos(-a);
  return { x: bl.x + dx * arm, y: bl.y + dy * arm };
}

/** Direction snap for drawing lines/arrows: `b` moved onto the nearest
 *  multiple of `stepDeg` around `a`, keeping the drag length. */
export function snapDirection(a: Pt, b: Pt, stepDeg = 15): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return b;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const snapped = Math.round(deg(ang) / stepDeg) * stepDeg;
  return {
    x: a.x + len * Math.cos(rad(snapped)),
    y: a.y + len * Math.sin(rad(snapped)),
  };
}

/**
 * MAGNETIC direction snap while drawing lines/arrows: when the drag direction
 * is within `tolDeg` of a 15° multiple, return `b` clicked exactly onto it,
 * else null (free drawing). The line-drawing sibling of niceAngleTarget —
 * always on, weak enough to draw any angle, Alt bypasses (in the controller).
 */
export function magneticDirection(a: Pt, b: Pt, tolDeg = 3): Pt | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return null;
  const ang = deg(Math.atan2(b.y - a.y, b.x - a.x));
  const nearest = Math.round(ang / 15) * 15;
  if (Math.abs(ang - nearest) > tolDeg) return null;
  return snapDirection(a, b);
}

// --- smooth curves through N points (Catmull-Rom -> cubic Bézier) -----------
// The curve tool stores THROUGH-points: the drawn spline passes through every
// stored point, so its handles are directly on the curve (drag to reshape,
// midpoint handles to add detail). Rendering converts each consecutive pair to
// one cubic Bézier segment with the standard uniform Catmull-Rom tangents.

export interface BezierSegment {
  c1: Pt;
  c2: Pt;
  to: Pt;
}

/** Cubic Bézier segments of the Catmull-Rom spline through `pts` (n ≥ 2),
 *  one per consecutive pair, endpoints clamped. */
export function splineSegments(pts: Pt[]): BezierSegment[] {
  const n = pts.length;
  const out: BezierSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    out.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      to: p2,
    });
  }
  return out;
}

/** The on-curve point halfway along spline segment `seg` (where the "add a
 *  point" handle sits — inserting there leaves the curve's shape intact). */
export function splineMidpoint(pts: Pt[], seg: number): Pt {
  const s = splineSegments(pts)[seg];
  const p1 = pts[seg];
  // Cubic Bézier at t = 0.5: (P1 + 3·C1 + 3·C2 + P2) / 8.
  return {
    x: (p1.x + 3 * s.c1.x + 3 * s.c2.x + s.to.x) / 8,
    y: (p1.y + 3 * s.c1.y + 3 * s.c2.y + s.to.y) / 8,
  };
}

export interface DragShape {
  /** World position of the shape's natural-box origin. */
  x: number;
  y: number;
  /** Natural box extents. */
  nw: number;
  nh: number;
  /** Natural-coordinate points (empty for rect/ellipse). */
  pts: Pt[];
}

/**
 * Derive a shape from a creation drag a→b (world coords).
 *   line / arrow — the two endpoints.
 *   rect / ellipse / triangle / polygon — fitted to the drag box
 *     (`square` forces a square box: Shift while drawing).
 *   curve — a cubic Bézier from a to b, control points bulging to one side
 *     so the fresh object visibly IS a curve (drag them to reshape).
 *   angle — vertex at a, a horizontal reference arm, the second arm at b:
 *     dragging "opens" the angle like a protractor.
 */
export function shapeFromDrag(
  kind: ShapeKind,
  a: Pt,
  b: Pt,
  opts: { sides?: number; square?: boolean } = {},
): DragShape {
  if (kind === "rect" || kind === "ellipse" || kind === "triangle" || kind === "polygon") {
    let w = Math.abs(b.x - a.x);
    let h = Math.abs(b.y - a.y);
    if (opts.square) w = h = Math.max(w, h);
    w = Math.max(w, 1);
    h = Math.max(h, 1);
    const x = b.x < a.x ? a.x - w : a.x;
    const y = b.y < a.y ? a.y - h : a.y;
    if (kind === "rect" || kind === "ellipse") {
      return { x, y, nw: w, nh: h, pts: [] };
    }
    const raw =
      kind === "triangle"
        ? [
            { x: w / 2, y: 0 },
            { x: w, y: h },
            { x: 0, y: h },
          ]
        : regularPolygonPts(opts.sides ?? 5, w, h);
    const n = renormalize(raw);
    return { x: x + n.ox, y: y + n.oy, nw: n.nw, nh: n.nh, pts: n.pts };
  }

  if (kind === "curve") {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // A third THROUGH-point bulging perpendicular from the midpoint, so the
    // fresh object visibly IS a curve (drag any point to reshape; midpoint
    // handles add more points).
    const px = (dy / len) * (len / 4);
    const py = (-dx / len) * (len / 4);
    const raw = [a, { x: a.x + dx / 2 + px, y: a.y + dy / 2 + py }, b];
    const n = renormalize(raw);
    return { x: n.ox, y: n.oy, nw: n.nw, nh: n.nh, pts: n.pts };
  }

  if (kind === "angle") {
    const len = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 40);
    const raw = [a, { x: a.x + len, y: a.y }, b];
    const n = renormalize(raw);
    return { x: n.ox, y: n.oy, nw: n.nw, nh: n.nh, pts: n.pts };
  }

  // line / arrow
  const n = renormalize([a, b]);
  return { x: n.ox, y: n.oy, nw: n.nw, nh: n.nh, pts: n.pts };
}
