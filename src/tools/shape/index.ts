// THE SHAPE TOOL (roadmap A2). Lines, arrows, rectangles, ellipses,
// triangles, regular polygons, Bézier curves and angle marks — one canvas
// tool storing `kind` plus a natural-coordinate point list (see geometry.ts
// for the coordinate model). A canvas tool, not a widget, so shapes export to
// PNG and sit in normal z-order (roadmap §5).
//
// Created by DRAGGING with the draw tool's shape modes
// (canvas/interactions/draw.ts), never from the Insert gallery — like text.
// Edited three ways, all live:
//   - box resize handles (uniform scale, like every canvas tool);
//   - VERTEX handles (the `vertices` capability below): drag a triangle's
//     corner and its angle labels update — the parametric-geometry seam the
//     select controller renders generically;
//   - the settings Dialog for exact values (polygon sides, exact angle,
//     fill / border styling, dashes, arrow heads).

import { defineCanvasTool } from "@/tools/registry";
import { theme } from "@/styles/theme";
import type { BoardObjectBase } from "@/board/types";
import { snapPt } from "@/board/geometry";
import {
  angleSweepDeg,
  interiorAngles,
  isClosed,
  nearestOnSpline,
  niceAngleTarget,
  renormalize,
  rotateAround,
  snapVertexAngle,
  splineSegments,
  splineTangents,
  vertexOnlyResize,
} from "@/tools/shape/geometry";
import type { Pt, ShapeKind, Tangents } from "@/tools/shape/geometry";
import { ShapeDialog } from "@/tools/shape/Dialog";

export interface ShapeParams {
  kind: ShapeKind;
  /** Natural box extents (the points' bbox; the box itself for rect/ellipse). */
  nw: number;
  nh: number;
  /** Natural-coordinate vertices (empty for rect/ellipse). */
  pts: Pt[];
  /** Border colour. */
  stroke: string;
  /** Border width (world px at natural size). */
  strokeWidth: number;
  /** Background colour, or "none" (closed kinds only). */
  fill: string;
  /** Dashed border. */
  dash: boolean;
  /** Show angle measures (triangle/polygon vertices, the angle tool's label). */
  showAngles: boolean;
  /** Arrow: draw a head at both ends. */
  both: boolean;
  /** Curve only: per-point tangent overrides parallel to `pts` (null =
   *  automatic Catmull-Rom tangent). Set by dragging a point's Bézier arms. */
  tans?: (Pt | null)[];
  /** Ellipse only: rotation in degrees (0-180). Other kinds bake rotation
   *  into their points instead (see the tool's `rotate`). */
  rot?: number;
  /** Ellipse only: natural radii, remembered once rotated (the natural box
   *  nw/nh becomes the rotated ellipse's AABB, so the radii need their own
   *  fields from then on). */
  erx?: number;
  ery?: number;
}

export type ShapeObject = BoardObjectBase & ShapeParams;

/** Fill value meaning "no background". */
export const NO_FILL = "none";

// Angle labels are teaching content read from across a classroom: big bold
// digits with a paper-coloured halo so they stay legible over grid lines,
// fills and the shape's own border.
const LABEL_FONT_PX = 17;

/** Degree text with a halo: an outlined pass in the paper colour under the
 *  filled pass, so the label reads over any background. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(251,250,247,0.9)";
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

// --- drawing --------------------------------------------------------------

function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  p: ShapeParams,
  scale: number,
): void {
  // The border keeps a constant on-canvas thickness regardless of box resize:
  // the ctx transform already multiplies by `scale`, so divide it back out.
  const w = p.strokeWidth / scale;
  ctx.strokeStyle = p.stroke;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(p.dash ? [w * 3, w * 2.5] : []);
}

function fillIfAny(ctx: CanvasRenderingContext2D, p: ShapeParams): void {
  if (!isClosed(p.kind) || p.fill === NO_FILL || !p.fill) return;
  ctx.fillStyle = p.fill;
  ctx.fill();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  tip: Pt,
  size: number,
): void {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(
    tip.x - size * Math.cos(ang - spread),
    tip.y - size * Math.sin(ang - spread),
  );
  ctx.lineTo(
    tip.x - size * Math.cos(ang + spread),
    tip.y - size * Math.sin(ang + spread),
  );
  ctx.closePath();
  ctx.fill();
}

/** Unit vector v→p, or null for a zero-length edge. */
function unitFrom(v: Pt, p: Pt): Pt | null {
  const dx = p.x - v.x;
  const dy = p.y - v.y;
  const l = Math.hypot(dx, dy);
  return l === 0 ? null : { x: dx / l, y: dy / l };
}

/** Angle arcs + degree labels at each polygon vertex. A right angle gets the
 *  conventional square mark instead of an arc. */
function drawPolygonAngles(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  font: string,
  color: string,
): void {
  const angles = interiorAngles(pts);
  const n = pts.length;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.font = "700 " + LABEL_FONT_PX + "px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const v = pts[i];
    const u1 = unitFrom(v, pts[(i - 1 + n) % n]);
    const u2 = unitFrom(v, pts[(i + 1) % n]);
    if (!u1 || !u2) continue;
    const e1 = Math.hypot(pts[(i - 1 + n) % n].x - v.x, pts[(i - 1 + n) % n].y - v.y);
    const e2 = Math.hypot(pts[(i + 1) % n].x - v.x, pts[(i + 1) % n].y - v.y);
    const r = Math.min(22, e1 * 0.4, e2 * 0.4);
    const right = Math.abs(angles[i] - 90) < 0.75;
    if (right) {
      // Square right-angle mark along the two edges.
      const s = r * 0.85;
      ctx.beginPath();
      ctx.moveTo(v.x + u1.x * s, v.y + u1.y * s);
      ctx.lineTo(v.x + (u1.x + u2.x) * s, v.y + (u1.y + u2.y) * s);
      ctx.lineTo(v.x + u2.x * s, v.y + u2.y * s);
      ctx.stroke();
    } else {
      const a1 = Math.atan2(u1.y, u1.x);
      const a2 = Math.atan2(u2.y, u2.x);
      // Sweep the SHORTER way round — that arc spans the interior angle.
      const delta = (a2 - a1 + Math.PI * 2) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, a1, a2, delta > Math.PI);
      ctx.stroke();
    }
    // Label on the angle bisector, just outside the arc.
    let bx = u1.x + u2.x;
    let by = u1.y + u2.y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-6) {
      bx = -u1.y;
      by = u1.x;
    } else {
      bx /= bl;
      by /= bl;
    }
    drawLabel(
      ctx,
      Math.round(angles[i]) + "°",
      v.x + bx * (r + 16),
      v.y + by * (r + 16),
    );
  }
  ctx.restore();
}

/** The angle tool: two rays from a vertex, the sweep arc and its measure. */
function drawAngleMark(
  ctx: CanvasRenderingContext2D,
  p: ShapeParams,
  ox: number,
  oy: number,
  font: string,
): void {
  const [v, a, b] = p.pts.map((q) => ({ x: ox + q.x, y: oy + q.y }));
  ctx.beginPath();
  ctx.moveTo(v.x, v.y);
  ctx.lineTo(a.x, a.y);
  ctx.moveTo(v.x, v.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const sweep = angleSweepDeg(v, a, b);
  const la = Math.hypot(a.x - v.x, a.y - v.y);
  const lb = Math.hypot(b.x - v.x, b.y - v.y);
  const r = Math.min(Math.max(Math.min(la, lb) * 0.32, 18), 52);
  const angA = Math.atan2(a.y - v.y, a.x - v.x);
  const angB = Math.atan2(b.y - v.y, b.x - v.x);

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1.5, p.strokeWidth * 0.6);
  if (Math.abs(sweep - 90) < 0.75) {
    // Right angle: the square mark.
    const ua = unitFrom(v, a)!;
    const ub = unitFrom(v, b)!;
    const s = r * 0.8;
    ctx.beginPath();
    ctx.moveTo(v.x + ua.x * s, v.y + ua.y * s);
    ctx.lineTo(v.x + (ua.x + ub.x) * s, v.y + (ua.y + ub.y) * s);
    ctx.lineTo(v.x + ub.x * s, v.y + ub.y * s);
    ctx.stroke();
  } else {
    // The sweep opens anticlockwise from arm A (see angleSweepDeg).
    ctx.beginPath();
    ctx.arc(v.x, v.y, r, angA, angB, true);
    ctx.stroke();
  }
  if (p.showAngles) {
    // Label on the bisector of the measured sweep.
    const mid = angA - ((sweep / 2) * Math.PI) / 180;
    ctx.font = "700 " + LABEL_FONT_PX + "px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.stroke;
    drawLabel(
      ctx,
      Math.round(sweep) + "°",
      v.x + Math.cos(mid) * (r + 20),
      v.y + Math.sin(mid) * (r + 20),
    );
  }
  ctx.restore();
}

/**
 * Render a shape's geometry with its top-left at (ox, oy), natural scale.
 * Shared by the tool's draw() and the draw controller's live drag preview.
 */
export function drawShapeGeometry(
  ctx: CanvasRenderingContext2D,
  p: ShapeParams,
  ox: number,
  oy: number,
  scale = 1,
): void {
  ctx.save();
  applyStrokeStyle(ctx, p, scale);

  switch (p.kind) {
    case "rect": {
      ctx.beginPath();
      ctx.rect(ox, oy, p.nw, p.nh);
      fillIfAny(ctx, p);
      ctx.stroke();
      break;
    }
    case "ellipse": {
      // Once rotated, the natural box is the rotated ellipse's AABB and the
      // true radii live in erx/ery (see ShapeParams).
      const rot = p.rot ?? 0;
      const rx = rot !== 0 ? (p.erx ?? p.nw / 2) : p.nw / 2;
      const ry = rot !== 0 ? (p.ery ?? p.nh / 2) : p.nh / 2;
      ctx.beginPath();
      ctx.ellipse(
        ox + p.nw / 2,
        oy + p.nh / 2,
        rx,
        ry,
        (rot * Math.PI) / 180,
        0,
        Math.PI * 2,
      );
      fillIfAny(ctx, p);
      ctx.stroke();
      break;
    }
    case "triangle":
    case "polygon": {
      const pts = p.pts.map((q) => ({ x: ox + q.x, y: oy + q.y }));
      if (pts.length < 3) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      fillIfAny(ctx, p);
      ctx.stroke();
      if (p.showAngles) drawPolygonAngles(ctx, pts, FONT_OF(ctx), p.stroke);
      break;
    }
    case "line":
    case "arrow": {
      const [a, b] = p.pts.map((q) => ({ x: ox + q.x, y: oy + q.y }));
      if (!a || !b) break;
      const head = Math.min(Math.max(p.strokeWidth * 3.5, 10), 26);
      // Shorten the shaft under each head so the tip stays crisp.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const isArrow = p.kind === "arrow";
      const a2 = isArrow && p.both ? { x: a.x + ux * head * 0.6, y: a.y + uy * head * 0.6 } : a;
      const b2 = isArrow ? { x: b.x - ux * head * 0.6, y: b.y - uy * head * 0.6 } : b;
      ctx.beginPath();
      ctx.moveTo(a2.x, a2.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.stroke();
      if (isArrow) {
        ctx.fillStyle = p.stroke;
        ctx.setLineDash([]);
        drawArrowHead(ctx, a, b, head);
        if (p.both) drawArrowHead(ctx, b, a, head);
      }
      break;
    }
    case "curve": {
      // A smooth spline THROUGH every stored point (n ≥ 2) — each handle sits
      // on the curve itself; tangent overrides (tans) bend it further.
      const pts = p.pts.map((q) => ({ x: ox + q.x, y: oy + q.y }));
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const s of splineSegments(pts, p.tans)) {
        ctx.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
      }
      ctx.stroke();
      break;
    }
    case "angle": {
      if (p.pts.length === 3) drawAngleMark(ctx, p, ox, oy, FONT_OF(ctx));
      break;
    }
  }
  ctx.restore();
}

// drawShapeGeometry is called both from draw() (which has kit.font) and the
// interaction preview (which has only a ctx). Labels want the app font; fall
// back to the ctx's current family via a module handle set by the tool.
let labelFont = "system-ui, sans-serif";
const FONT_OF = (_ctx: CanvasRenderingContext2D): string => labelFont;
export function setShapeLabelFont(font: string): void {
  labelFont = font;
}

// --- vertex-capability helpers ----------------------------------------------

/** World-space copies of an object's points (natural * uniform scale + origin). */
function worldPts(o: ShapeObject): { s: number; pts: Pt[] } {
  const s = o.w / Math.max(o.nw, 1);
  return { s, pts: o.pts.map((p) => ({ x: o.x + p.x * s, y: o.y + p.y * s })) };
}

/** Tangent overrides scaled into world units (vectors: no origin shift). */
function worldTans(o: ShapeObject, s: number): Tangents {
  return o.tans?.map((t) => (t ? { x: t.x * s, y: t.y * s } : null));
}

/**
 * The tangent list to store after a vertex edit that re-normalised the points
 * (scale folds to 1): world-sized vectors, with the same splice the points
 * got. Returns undefined when the object never had overrides, so the patch
 * can omit the field entirely.
 */
function foldedTans(
  o: ShapeObject,
  s: number,
  edit?: { insertAt?: number; removeAt?: number },
): (Pt | null)[] | undefined {
  if (!o.tans || o.tans.length === 0) return undefined;
  const out: (Pt | null)[] = o.tans.map((t) =>
    t ? { x: t.x * s, y: t.y * s } : null,
  );
  if (edit?.insertAt != null) out.splice(edit.insertAt, 0, null);
  if (edit?.removeAt != null) out.splice(edit.removeAt, 1);
  return out;
}

// --- the tool ---------------------------------------------------------------

export const shapeTool = defineCanvasTool<ShapeParams>({
  kind: "canvas",
  type: "shape",
  name: "Shape",
  blurb: "lines, arrows & geometry",
  category: "geometry",
  inGallery: false, // created by dragging with the draw tool's shape modes

  defaults: () => ({
    kind: "rect" as ShapeKind,
    nw: 150,
    nh: 105,
    pts: [],
    stroke: theme.ink,
    strokeWidth: 3,
    fill: NO_FILL,
    dash: false,
    showAngles: false,
    both: false,
  }),

  size: (p) => ({ w: Math.max(p.nw, 1), h: Math.max(p.nh, 1) }),

  draw: ({ ctx, font, scale }, o) => {
    setShapeLabelFont(font);
    drawShapeGeometry(ctx, o, o.x, o.y, scale);
  },

  Dialog: ShapeDialog,

  // Live styling (options pill + shortcuts, via board/styling.ts): the shape's
  // "colour" is its border, its "size" the border width; fill is the background.
  styling: {
    color: {
      get: (o) => o.stroke,
      patch: (_o, stroke) => ({ stroke }),
    },
    fill: {
      get: (o) => o.fill,
      patch: (_o, fill) => ({ fill }),
    },
    size: {
      get: (o) => o.strokeWidth,
      patch: (_o, strokeWidth) => ({ strokeWidth }),
    },
  },

  // Parametric vertex editing (rendered generically by the select controller).
  vertices: {
    get(o: ShapeObject) {
      const s = o.w / Math.max(o.nw, 1);
      return o.pts.map((p) => ({ x: o.x + p.x * s, y: o.y + p.y * s }));
    },
    move(
      o: ShapeObject,
      i: number,
      wx: number,
      wy: number,
      opts?: { gridSnap?: boolean; angleSnap?: boolean },
    ) {
      const s = o.w / Math.max(o.nw, 1);
      const world = o.pts.map((p) => ({ x: o.x + p.x * s, y: o.y + p.y * s }));
      if (!world[i]) return {};
      world[i] = { x: wx, y: wy };

      // MAGNETIC ANGLES — the parametric-teaching core. Dragging a triangle /
      // polygon corner clicks the interior angle onto right angles and 15°
      // multiples (snapVertexAngle); dragging an angle-tool arm keeps the
      // measure a whole number of degrees, magnetised the same way. When an
      // angle magnet engages it wins over the grid (they rarely agree).
      let snappedByAngle = false;
      if (opts?.angleSnap !== false) {
        if (o.kind === "triangle" || o.kind === "polygon") {
          const snapped = snapVertexAngle(world, i);
          if (snapped) {
            world[i] = snapped;
            snappedByAngle = true;
          }
        } else if (o.kind === "angle" && world.length === 3 && i > 0) {
          const [v] = world;
          const sweep = angleSweepDeg(v, world[1], world[2]);
          const target = niceAngleTarget(sweep) ?? Math.round(sweep);
          if (Math.abs(sweep - target) > 1e-9) {
            // Rotate the MOVED arm so the measure lands exactly on target.
            const delta = sweep - target;
            world[i] = rotateAround(world[i], v, i === 2 ? delta : -delta);
            snappedByAngle = true;
          }
        }
      }
      if (!snappedByAngle && opts?.gridSnap) {
        world[i] = snapPt(world[i]);
      }

      // Re-normalise: the moved set becomes the new natural geometry at
      // scale 1 (points absorb any previous uniform resize; tangent overrides
      // absorb the same fold).
      const n = renormalize(world);
      const tans = foldedTans(o, s);
      return {
        pts: n.pts,
        nw: n.nw,
        nh: n.nh,
        x: n.ox,
        y: n.oy,
        w: n.nw,
        h: n.nh,
        ...(tans ? { tans } : {}),
      };
    },
    replacesResize(o: ShapeObject) {
      return vertexOnlyResize(o.kind);
    },

    // ADD / REMOVE points. Polygons keep midpoint "+" handles on each edge;
    // curves instead add points by DOUBLE-CLICKING the line itself
    // (insertOnPath), CAD-style. Double-clicking a vertex removes it (down to
    // each kind's minimum). Inserting into a triangle makes it a polygon —
    // it stops being a triangle the moment it has four corners.
    midpoints(o: ShapeObject) {
      const { pts: world } = worldPts(o);
      if (
        (o.kind === "polygon" || o.kind === "triangle") &&
        world.length >= 3
      ) {
        // One handle per edge, including the closing edge (last -> first).
        return world.map((p, i) => {
          const q = world[(i + 1) % world.length];
          return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        });
      }
      return [];
    },
    insert(o: ShapeObject, seg: number, wx: number, wy: number) {
      const { s, pts: world } = worldPts(o);
      if (seg < 0 || seg >= world.length) return null;
      const index = seg + 1; // also right for the closing edge: append
      world.splice(index, 0, { x: wx, y: wy });
      const n = renormalize(world);
      const tans = foldedTans(o, s, { insertAt: index });
      const patch: Record<string, unknown> = {
        pts: n.pts,
        nw: n.nw,
        nh: n.nh,
        x: n.ox,
        y: n.oy,
        w: n.nw,
        h: n.nh,
        ...(tans ? { tans } : {}),
      };
      if (o.kind === "triangle") patch.kind = "polygon";
      return { patch, index };
    },
    insertOnPath(o: ShapeObject, wx: number, wy: number, tol: number) {
      // Double-click on the drawn line: drop a new point right there. Curves
      // only — polygons have their edge midpoint handles.
      if (o.kind !== "curve" || o.pts.length < 2) return null;
      const { s, pts: world } = worldPts(o);
      const hit = nearestOnSpline(world, { x: wx, y: wy }, worldTans(o, s));
      if (!hit || hit.dist > tol) return null;
      const index = hit.seg + 1;
      world.splice(index, 0, hit.pt);
      const n = renormalize(world);
      const tans = foldedTans(o, s, { insertAt: index });
      return {
        patch: {
          pts: n.pts,
          nw: n.nw,
          nh: n.nh,
          x: n.ox,
          y: n.oy,
          w: n.nw,
          h: n.nh,
          ...(tans ? { tans } : {}),
        },
        index,
      };
    },
    remove(o: ShapeObject, i: number) {
      const min = o.kind === "curve" ? 2 : 3;
      if (o.pts.length <= min || i < 0 || i >= o.pts.length) return null;
      const { s, pts: world } = worldPts(o);
      world.splice(i, 1);
      const n = renormalize(world);
      const tans = foldedTans(o, s, { removeAt: i });
      return {
        pts: n.pts,
        nw: n.nw,
        nh: n.nh,
        x: n.ox,
        y: n.oy,
        w: n.nw,
        h: n.nh,
        ...(tans ? { tans } : {}),
      };
    },

    // BÉZIER ARMS (curves): clicking a point exposes its tangent as one or
    // two draggable arm handles — the segment control points either side.
    // Dragging an arm writes a tangent OVERRIDE for that point (both arms
    // stay mirrored, keeping the curve smooth through it).
    arms(o: ShapeObject, i: number) {
      if (o.kind !== "curve" || o.pts.length < 2) return [];
      const { s, pts: world } = worldPts(o);
      if (i < 0 || i >= world.length) return [];
      const m = splineTangents(world, worldTans(o, s))[i];
      const p = world[i];
      const out: { x: number; y: number; side: 1 | -1 }[] = [];
      if (i > 0) out.push({ x: p.x - m.x / 3, y: p.y - m.y / 3, side: -1 });
      if (i < world.length - 1) {
        out.push({ x: p.x + m.x / 3, y: p.y + m.y / 3, side: 1 });
      }
      return out;
    },
    moveArm(o: ShapeObject, i: number, side: 1 | -1, wx: number, wy: number) {
      if (o.kind !== "curve") return {};
      const { s, pts: world } = worldPts(o);
      if (!world[i]) return {};
      const p = world[i];
      // Arm position -> tangent: the arm sits at P + side·m/3.
      const mWorld = { x: side * (wx - p.x) * 3, y: side * (wy - p.y) * 3 };
      const tans: (Pt | null)[] = o.pts.map((_, k) => o.tans?.[k] ?? null);
      tans[i] = { x: mWorld.x / s, y: mWorld.y / s }; // back to natural units
      return { tans };
    },
  },

  // ROTATION. Point kinds bake the turn into their geometry (rotate the world
  // points about the box centre, renormalise — angle labels stay live). A
  // rectangle becomes the 4-gon it visually is; an ellipse keeps parametric
  // radii plus a `rot` angle and its box becomes the rotated AABB.
  rotate(o: ShapeObject, degrees: number) {
    const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    if (o.kind === "rect") {
      const corners = [
        { x: o.x, y: o.y },
        { x: o.x + o.w, y: o.y },
        { x: o.x + o.w, y: o.y + o.h },
        { x: o.x, y: o.y + o.h },
      ].map((p) => rotateAround(p, c, degrees));
      const n = renormalize(corners);
      return {
        kind: "polygon",
        pts: n.pts,
        nw: n.nw,
        nh: n.nh,
        x: n.ox,
        y: n.oy,
        w: n.nw,
        h: n.nh,
      };
    }
    if (o.kind === "ellipse") {
      const s = o.w / Math.max(o.nw, 1);
      const erx = o.erx ?? o.nw / 2;
      const ery = o.ery ?? o.nh / 2;
      // An ellipse repeats every 180°.
      const rot = (((o.rot ?? 0) + degrees) % 180 + 180) % 180;
      const t = (rot * Math.PI) / 180;
      const hw = Math.hypot(erx * Math.cos(t), ery * Math.sin(t));
      const hh = Math.hypot(erx * Math.sin(t), ery * Math.cos(t));
      return {
        rot,
        erx,
        ery,
        nw: hw * 2,
        nh: hh * 2,
        w: hw * 2 * s,
        h: hh * 2 * s,
        x: c.x - hw * s,
        y: c.y - hh * s,
      };
    }
    const s = o.w / Math.max(o.nw, 1);
    const world = o.pts.map((p) =>
      rotateAround({ x: o.x + p.x * s, y: o.y + p.y * s }, c, degrees),
    );
    const n = renormalize(world);
    // Tangent overrides are direction vectors: rotate them in place (and fold
    // the uniform scale, like the points).
    const tans = o.tans?.map((t) => {
      if (!t) return null;
      const r = rotateAround({ x: t.x * s, y: t.y * s }, { x: 0, y: 0 }, degrees);
      return { x: r.x, y: r.y };
    });
    return {
      pts: n.pts,
      nw: n.nw,
      nh: n.nh,
      x: n.ox,
      y: n.oy,
      w: n.nw,
      h: n.nh,
      ...(tans ? { tans } : {}),
    };
  },
});

export default shapeTool;
export { hasAngles, isClosed, SHAPE_KINDS } from "@/tools/shape/geometry";
export type { ShapeKind, Pt } from "@/tools/shape/geometry";
