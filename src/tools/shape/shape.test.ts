// The shape tool's pure geometry (drag derivation, interior angles, angle
// sweeps, magnetic angle snapping) and its vertex-editing capability — the
// parametric seams the canvas interactions build on.

import { describe, expect, it } from "vitest";
import "@/tools";
import {
  angleSweepDeg,
  apexFromBaseAngles,
  armForAngle,
  interiorAngles,
  magneticDirection,
  niceAngleTarget,
  regularPolygonPts,
  renormalize,
  rotateAround,
  shapeFromDrag,
  snapDirection,
  snapVertexAngle,
  splineMidpoint,
  splineSegments,
  splineTangents,
} from "@/tools/shape/geometry";
import shapeTool, { drawShapeGeometry } from "@/tools/shape";
import type { ShapeObject, ShapeParams } from "@/tools/shape";

const shapeObj = (over: Partial<ShapeObject> = {}): ShapeObject => ({
  id: "s1",
  type: "shape",
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  kind: "triangle",
  nw: 100,
  nh: 100,
  pts: [
    { x: 50, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  stroke: "#000",
  strokeWidth: 3,
  fill: "none",
  dash: false,
  showAngles: true,
  both: false,
  ...over,
});

describe("drag derivation (shapeFromDrag)", () => {
  it("boxes a rect to the drag in any direction; Shift squares it", () => {
    const d = shapeFromDrag("rect", { x: 200, y: 150 }, { x: 100, y: 90 });
    expect(d).toMatchObject({ x: 100, y: 90, nw: 100, nh: 60 });
    const sq = shapeFromDrag(
      "rect",
      { x: 0, y: 0 },
      { x: 100, y: 40 },
      { square: true },
    );
    expect(sq.nw).toBe(100);
    expect(sq.nh).toBe(100);
  });

  it("keeps line endpoints and floors degenerate extents at 1", () => {
    const d = shapeFromDrag("line", { x: 10, y: 20 }, { x: 10, y: 120 });
    expect(d.nw).toBe(1); // vertical line: zero width floored
    expect(d.nh).toBe(100);
    expect(d.pts).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
  });

  it("builds a regular n-gon in the drag box", () => {
    const d = shapeFromDrag(
      "polygon",
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { sides: 6 },
    );
    expect(d.pts).toHaveLength(6);
    // A regular hexagon's vertices all sit on the inscribed ellipse.
    const angles = interiorAngles(d.pts);
    for (const a of angles) expect(a).toBeCloseTo(120, 3);
  });

  it("opens an angle like a protractor: drag up-left of the vertex reads 135°", () => {
    const d = shapeFromDrag("angle", { x: 100, y: 100 }, { x: 30, y: 30 });
    const world = d.pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
    expect(angleSweepDeg(world[0], world[1], world[2])).toBeCloseTo(135, 5);
  });
});

describe("angle maths", () => {
  it("interiorAngles of a right isosceles triangle reads 90/45/45", () => {
    const a = interiorAngles([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]);
    expect(a[0]).toBeCloseTo(90, 5);
    expect(a[1]).toBeCloseTo(45, 5);
    expect(a[2]).toBeCloseTo(45, 5);
  });

  it("angleSweepDeg opens anticlockwise and supports reflex measures", () => {
    const v = { x: 0, y: 0 };
    const east = { x: 100, y: 0 };
    expect(angleSweepDeg(v, east, { x: 0, y: -100 })).toBeCloseTo(90, 5);
    expect(angleSweepDeg(v, east, { x: -100, y: 0 })).toBeCloseTo(180, 5);
    expect(angleSweepDeg(v, east, { x: 0, y: 100 })).toBeCloseTo(270, 5);
  });

  it("armForAngle rotates the second arm to an exact measure", () => {
    const v = { x: 0, y: 0 };
    const a = { x: 100, y: 0 };
    const b = { x: 70, y: -70 };
    const rotated = armForAngle(v, a, b, 90);
    expect(angleSweepDeg(v, a, rotated)).toBeCloseTo(90, 5);
    expect(Math.hypot(rotated.x, rotated.y)).toBeCloseTo(Math.hypot(70, 70), 5);
  });

  it("apexFromBaseAngles rebuilds a triangle with exact base angles", () => {
    const bl = { x: 0, y: 100 };
    const br = { x: 120, y: 100 };
    const apex = apexFromBaseAngles(bl, br, { x: 60, y: 0 }, 90, 45);
    const angles = interiorAngles([apex, br, bl]);
    expect(angles[2]).toBeCloseTo(90, 4); // left base vertex
    expect(angles[1]).toBeCloseTo(45, 4); // right base vertex
    expect(angles[0]).toBeCloseTo(45, 4); // apex
    expect(apex.y).toBeLessThan(100); // stayed on the reference side
  });

  it("snapDirection constrains a drag to 15° steps", () => {
    const b = snapDirection({ x: 0, y: 0 }, { x: 100, y: 4 });
    expect(b.y).toBeCloseTo(0, 5);
    expect(b.x).toBeCloseTo(Math.hypot(100, 4), 5);
  });
});

describe("magnetic angle snapping", () => {
  it("niceAngleTarget magnetises 15° multiples, with a wider window on 90°", () => {
    expect(niceAngleTarget(88)).toBe(90); // within the 5° right-angle magnet
    expect(niceAngleTarget(46.4)).toBe(45);
    expect(niceAngleTarget(52)).toBeNull(); // between magnets
    expect(niceAngleTarget(119)).toBe(120);
  });

  it("snapVertexAngle lands the dragged corner on an exact right angle", () => {
    // Near-right angle at vertex 0 (its neighbours pin the chord).
    const pts = [
      { x: 2, y: -3 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    const snapped = snapVertexAngle(pts, 0);
    expect(snapped).not.toBeNull();
    const after = [snapped!, pts[1], pts[2]];
    expect(interiorAngles(after)[0]).toBeCloseTo(90, 3);
    // The correction is small — a snap, not a jump.
    expect(Math.hypot(snapped!.x - 2, snapped!.y + 3)).toBeLessThan(12);
  });

  it("returns null away from any magnet", () => {
    const pts = [
      { x: 30, y: -40 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    const before = interiorAngles(pts)[0];
    if (niceAngleTarget(before) == null) {
      expect(snapVertexAngle(pts, 0)).toBeNull();
    }
  });
});

describe("border thickness under box resize", () => {
  // A recording stub: methods no-op, property writes stick. The scene applies
  // the box scale to the ctx transform, so the on-canvas border thickness is
  // the lineWidth the shape sets multiplied by that scale.
  const recordingCtx = () =>
    new Proxy(
      { lineWidth: 0 } as { lineWidth: number },
      { get: (t, k) => (k in t ? (t as never)[k] : () => {}) },
    ) as unknown as CanvasRenderingContext2D & { lineWidth: number };

  const rect = (): ShapeParams => ({
    kind: "rect",
    nw: 100,
    nh: 100,
    pts: [],
    stroke: "#000",
    strokeWidth: 3,
    fill: "none",
    dash: false,
    showAngles: false,
    both: false,
  });

  it("keeps a constant on-canvas thickness regardless of the resize scale", () => {
    for (const scale of [1, 2, 5, 0.5]) {
      const ctx = recordingCtx();
      drawShapeGeometry(ctx, rect(), 0, 0, scale);
      // lineWidth * scale is the effective on-canvas thickness — always 3.
      expect(ctx.lineWidth * scale).toBeCloseTo(3, 6);
    }
  });

  it("defaults to natural scale (1) when no scale is given", () => {
    const ctx = recordingCtx();
    drawShapeGeometry(ctx, rect(), 0, 0);
    expect(ctx.lineWidth).toBe(3);
  });
});

describe("the vertices capability", () => {
  const cap = shapeTool.vertices!;

  it("reports world-space handles honouring the uniform resize scale", () => {
    const o = shapeObj({ x: 10, y: 20, w: 200, h: 200 }); // scale 2
    const pts = cap.get(o as never) as { x: number; y: number }[];
    expect(pts[0]).toEqual({ x: 110, y: 20 });
    expect(pts[1]).toEqual({ x: 210, y: 220 });
  });

  it("moving a vertex re-normalises: box tracks the new bbox, scale folds to 1", () => {
    const o = shapeObj();
    // Drag the apex straight up by 50 (no snapping).
    const patch = cap.move(o as never, 0, 50, -50, {
      gridSnap: false,
      angleSnap: false,
    }) as Partial<ShapeObject>;
    expect(patch.y).toBe(-50);
    expect(patch.nh).toBe(150);
    expect(patch.h).toBe(150);
    expect(patch.w).toBe(patch.nw);
    expect((patch.pts as ShapeParams["pts"])[0]).toEqual({ x: 50, y: 0 });
  });

  it("angle magnet: dragging a corner near 90° clicks ITS angle exact", () => {
    // Triangle apex (0,0), BR (100,100): dragging BL to (3,98) puts the angle
    // AT BL near 93° — inside the right-angle magnet.
    const o = shapeObj({
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      nw: 100,
      nh: 100,
      w: 100,
      h: 100,
    });
    const patch = cap.move(o as never, 2, 3, 98, {
      angleSnap: true,
    }) as Partial<ShapeObject>;
    const pts = patch.pts as ShapeParams["pts"];
    const world = pts.map((p) => ({
      x: p.x + (patch.x as number),
      y: p.y + (patch.y as number),
    }));
    expect(interiorAngles(world)[2]).toBeCloseTo(90, 3);
  });

  it("angle tool arms keep whole-degree measures while dragging", () => {
    const o = shapeObj({
      kind: "angle",
      pts: [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 80, y: 20 },
      ],
      nw: 100,
      nh: 100,
      w: 100,
      h: 100,
    });
    const patch = cap.move(o as never, 2, 77.3, 21.9, {
      angleSnap: true,
    }) as Partial<ShapeObject>;
    const pts = patch.pts as ShapeParams["pts"];
    const world = pts.map((p) => ({
      x: p.x + (patch.x as number),
      y: p.y + (patch.y as number),
    }));
    const sweep = angleSweepDeg(world[0], world[1], world[2]);
    expect(Math.abs(sweep - Math.round(sweep))).toBeLessThan(1e-6);
  });

  it("box handles are replaced by vertices only for line-like kinds", () => {
    expect(cap.replacesResize!(shapeObj({ kind: "line" }) as never)).toBe(true);
    expect(cap.replacesResize!(shapeObj({ kind: "curve" }) as never)).toBe(true);
    expect(cap.replacesResize!(shapeObj() as never)).toBe(false); // triangle
    expect(cap.replacesResize!(shapeObj({ kind: "polygon" }) as never)).toBe(
      false,
    );
  });

  it("edge midpoint handles: polygons/triangles only (curves add via the line)", () => {
    // Triangle: three edges including the closing one.
    expect(cap.midpoints!(shapeObj() as never)).toHaveLength(3);
    // Curves have no midpoint handles — insertOnPath covers them.
    expect(
      cap.midpoints!(
        shapeObj({
          kind: "curve",
          pts: [
            { x: 0, y: 0 },
            { x: 50, y: 50 },
            { x: 100, y: 0 },
          ],
        }) as never,
      ),
    ).toHaveLength(0);
    // Lines don't take extra points.
    expect(
      cap.midpoints!(
        shapeObj({
          kind: "line",
          pts: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        }) as never,
      ),
    ).toHaveLength(0);
  });

  it("insertOnPath drops a point on the clicked spot of the curve", () => {
    const curve = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      nw: 100,
      nh: 100,
    });
    // Click ON the (straight) spline halfway along, generous tolerance.
    const ins = cap.insertOnPath!(curve as never, 50, 52, 12)!;
    expect(ins).not.toBeNull();
    expect(ins.index).toBe(1);
    expect(ins.patch.pts).toHaveLength(3);
    // Click far away from the line: nothing.
    expect(cap.insertOnPath!(curve as never, 90, 10, 12)).toBeNull();
  });

  it("a focused curve point exposes Bézier arms; dragging one bends the curve", () => {
    const curve = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ],
      nw: 100,
      nh: 100,
    });
    // Middle point: two mirrored arms along the auto tangent (horizontal).
    const arms = cap.arms!(curve as never, 1);
    expect(arms).toHaveLength(2);
    expect(arms[0].side + arms[1].side).toBe(0);
    expect(arms[0].y).toBeCloseTo(50, 5);
    // Endpoints get a single arm, pointing into the curve.
    expect(cap.arms!(curve as never, 0)).toHaveLength(1);
    expect(cap.arms!(curve as never, 2)).toHaveLength(1);
    // Drag the middle point's forward arm upward -> a tangent override.
    const patch = cap.moveArm!(curve as never, 1, 1, 66, 40) as {
      tans: ({ x: number; y: number } | null)[];
    };
    expect(patch.tans).toHaveLength(3);
    expect(patch.tans[0]).toBeNull();
    expect(patch.tans[1]!.y).toBeLessThan(0); // tangent now points up
    // The rendered arms follow the override.
    const bent = { ...curve, tans: patch.tans };
    const after = cap.arms!(bent as never, 1);
    expect(after.find((a) => a.side === 1)!.y).toBeLessThan(50);
  });

  it("removing a curve point keeps the other points' tangent overrides", () => {
    const curve = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ],
      nw: 100,
      nh: 50,
      tans: [null, { x: 30, y: 0 }, null],
    });
    const patch = cap.remove!(curve as never, 0)! as {
      pts: unknown[];
      tans: ({ x: number; y: number } | null)[];
    };
    expect(patch.pts).toHaveLength(2);
    expect(patch.tans).toHaveLength(2);
    expect(patch.tans[0]).toEqual({ x: 30, y: 0 }); // followed its point
  });

  it("insert adds a vertex on the pressed segment and reports its index", () => {
    const curve = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      nw: 100,
      nh: 100,
    });
    const ins = cap.insert!(curve as never, 0, 50, 80)!;
    expect(ins.index).toBe(1);
    const pts = ins.patch.pts as { x: number; y: number }[];
    expect(pts).toHaveLength(3);
  });

  it("inserting a corner into a triangle turns it into a polygon", () => {
    const ins = cap.insert!(shapeObj() as never, 0, 75, 50)!;
    expect(ins.patch.kind).toBe("polygon");
    expect(ins.patch.pts).toHaveLength(4);
  });

  it("remove drops a vertex but never below the kind's minimum", () => {
    const curve = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ],
    });
    const patch = cap.remove!(curve as never, 1)!;
    expect(patch.pts).toHaveLength(2);
    // A 2-point curve and a 3-corner polygon are already minimal.
    const minimal = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    expect(cap.remove!(minimal as never, 0)).toBeNull();
    expect(cap.remove!(shapeObj() as never, 0)).toBeNull(); // triangle
  });
});

describe("rotation", () => {
  const rotate = shapeTool.rotate!;

  it("turns a triangle's points about the box centre (angles preserved)", () => {
    const o = shapeObj();
    const before = interiorAngles(o.pts);
    const patch = rotate(o as never, 30) as Partial<ShapeObject>;
    const after = interiorAngles(patch.pts as ShapeParams["pts"]);
    // Same angles at the same corners — rotation is rigid.
    after.forEach((a, i) => expect(a).toBeCloseTo(before[i], 4));
    // Every world point is EXACTLY its original rotated 30° about (50, 50).
    const world = (patch.pts as ShapeParams["pts"]).map((p) => ({
      x: p.x + (patch.x as number),
      y: p.y + (patch.y as number),
    }));
    o.pts.forEach((p, i) => {
      const expected = rotateAround(p, { x: 50, y: 50 }, 30);
      expect(world[i].x).toBeCloseTo(expected.x, 4);
      expect(world[i].y).toBeCloseTo(expected.y, 4);
    });
  });

  it("a rotated rectangle becomes the 4-gon it visually is", () => {
    const o = shapeObj({ kind: "rect", pts: [], nw: 100, nh: 50, w: 100, h: 50 });
    const patch = rotate(o as never, 45) as Partial<ShapeObject>;
    expect(patch.kind).toBe("polygon");
    const pts = patch.pts as ShapeParams["pts"];
    expect(pts).toHaveLength(4);
    // Still a rectangle: all four interior angles stay right angles.
    for (const a of interiorAngles(pts)) expect(a).toBeCloseTo(90, 4);
  });

  it("an ellipse keeps its radii and re-derives its box as the rotated AABB", () => {
    const o = shapeObj({ kind: "ellipse", pts: [], nw: 100, nh: 50, w: 100, h: 50 });
    const patch = rotate(o as never, 90) as Partial<ShapeObject>;
    expect(patch.rot).toBe(90);
    expect(patch.erx).toBe(50);
    expect(patch.ery).toBe(25);
    // At 90° the AABB swaps.
    expect(patch.nw).toBeCloseTo(50, 4);
    expect(patch.nh).toBeCloseTo(100, 4);
    // Two quarter turns come back around (180° ≡ 0 for an ellipse).
    const back = rotate(
      { ...o, ...patch } as never,
      90,
    ) as Partial<ShapeObject>;
    expect(back.rot).toBe(0);
    expect(back.nw).toBeCloseTo(100, 4);
    expect(back.nh).toBeCloseTo(50, 4);
  });
});

describe("splines (multi-point curves)", () => {
  it("splineSegments interpolates THROUGH every stored point", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 60 },
      { x: 100, y: 0 },
    ];
    const segs = splineSegments(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0].to).toEqual(pts[1]);
    expect(segs[1].to).toEqual(pts[2]);
  });

  it("a tangent override replaces the automatic Catmull-Rom tangent", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const auto = splineTangents(pts);
    expect(auto[1]).toEqual({ x: 50, y: 0 });
    const over = splineTangents(pts, [null, { x: 0, y: 60 }, null]);
    expect(over[1]).toEqual({ x: 0, y: 60 });
    expect(over[0]).toEqual(auto[0]); // untouched points stay automatic
    // The override reshapes the adjacent segments' control points.
    const segs = splineSegments(pts, [null, { x: 0, y: 60 }, null]);
    expect(segs[0].c2.y).toBeCloseTo(-20, 5); // P1 - m1/3
    expect(segs[1].c1.y).toBeCloseTo(20, 5); // P1 + m1/3
  });

  it("splineMidpoint of a straight 2-point curve is the chord midpoint", () => {
    const m = splineMidpoint(
      [
        { x: 0, y: 0 },
        { x: 100, y: 40 },
      ],
      0,
    );
    expect(m.x).toBeCloseTo(50, 5);
    expect(m.y).toBeCloseTo(20, 5);
  });

  it("magneticDirection clicks near-15° drags exact and lets others be", () => {
    const snapped = magneticDirection({ x: 0, y: 0 }, { x: 100, y: 4 });
    expect(snapped).not.toBeNull();
    expect(snapped!.y).toBeCloseTo(0, 5);
    expect(magneticDirection({ x: 0, y: 0 }, { x: 100, y: 14 })).toBeNull();
  });
});

describe("renormalize", () => {
  it("shifts the bbox to the origin and reports the offset", () => {
    const n = renormalize([
      { x: 10, y: 30 },
      { x: 60, y: 80 },
    ]);
    expect(n).toMatchObject({ ox: 10, oy: 30, nw: 50, nh: 50 });
    expect(n.pts[0]).toEqual({ x: 0, y: 0 });
  });

  it("regularPolygonPts starts at the top with the requested side count", () => {
    const pts = regularPolygonPts(4, 100, 100);
    expect(pts).toHaveLength(4);
    expect(pts[0].x).toBeCloseTo(50, 5);
    expect(pts[0].y).toBeCloseTo(0, 5);
  });
});
