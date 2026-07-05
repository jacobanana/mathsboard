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
  niceAngleTarget,
  renormalize,
  rotateAround,
  snapVertexAngle,
  vertexOnlyResize,
} from "@/tools/shape/geometry";
import type { Pt, ShapeKind } from "@/tools/shape/geometry";
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
}

export type ShapeObject = BoardObjectBase & ShapeParams;

/** Fill value meaning "no background". */
export const NO_FILL = "none";

const LABEL_FONT_PX = 13;

// --- drawing --------------------------------------------------------------

function applyStrokeStyle(ctx: CanvasRenderingContext2D, p: ShapeParams): void {
  ctx.strokeStyle = p.stroke;
  ctx.lineWidth = p.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(p.dash ? [p.strokeWidth * 3, p.strokeWidth * 2.5] : []);
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
    const r = Math.min(16, e1 * 0.4, e2 * 0.4);
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
    ctx.fillText(
      Math.round(angles[i]) + "°",
      v.x + bx * (r + 13),
      v.y + by * (r + 13),
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
  const r = Math.min(Math.max(Math.min(la, lb) * 0.32, 14), 44);
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
    ctx.fillText(
      Math.round(sweep) + "°",
      v.x + Math.cos(mid) * (r + 16),
      v.y + Math.sin(mid) * (r + 16),
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
): void {
  ctx.save();
  applyStrokeStyle(ctx, p);

  switch (p.kind) {
    case "rect": {
      ctx.beginPath();
      ctx.rect(ox, oy, p.nw, p.nh);
      fillIfAny(ctx, p);
      ctx.stroke();
      break;
    }
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(ox + p.nw / 2, oy + p.nh / 2, p.nw / 2, p.nh / 2, 0, 0, Math.PI * 2);
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
      const [p0, c1, c2, p1] = p.pts.map((q) => ({ x: ox + q.x, y: oy + q.y }));
      if (!p0 || !c1 || !c2 || !p1) break;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
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

  draw: ({ ctx, font }, o) => {
    setShapeLabelFont(font);
    drawShapeGeometry(ctx, o, o.x, o.y);
  },

  Dialog: ShapeDialog,

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
      // scale 1 (points absorb any previous uniform resize).
      const n = renormalize(world);
      return { pts: n.pts, nw: n.nw, nh: n.nh, x: n.ox, y: n.oy, w: n.nw, h: n.nh };
    },
    replacesResize(o: ShapeObject) {
      return vertexOnlyResize(o.kind);
    },
    guides(o: ShapeObject) {
      if (o.kind !== "curve") return [];
      const s = o.w / Math.max(o.nw, 1);
      const w = o.pts.map((p) => ({ x: o.x + p.x * s, y: o.y + p.y * s }));
      if (w.length !== 4) return [];
      // Control arms: end point -> its control point.
      return [
        [w[0], w[1]],
        [w[3], w[2]],
      ] as [Pt, Pt][];
    },
  },
});

export default shapeTool;
export { hasAngles, isClosed, SHAPE_KINDS } from "@/tools/shape/geometry";
export type { ShapeKind, Pt } from "@/tools/shape/geometry";
