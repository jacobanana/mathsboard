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
  niceAngleTarget,
  regularPolygonPts,
  renormalize,
  shapeFromDrag,
  snapDirection,
  snapVertexAngle,
} from "@/tools/shape/geometry";
import shapeTool from "@/tools/shape";
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

  it("curves expose their control arms as guides", () => {
    const o = shapeObj({
      kind: "curve",
      pts: [
        { x: 0, y: 0 },
        { x: 30, y: -20 },
        { x: 70, y: -20 },
        { x: 100, y: 0 },
      ],
    });
    const guides = cap.guides!(o as never);
    expect(guides).toHaveLength(2);
    expect(guides[0][0]).toEqual({ x: 0, y: 0 });
    expect(guides[0][1]).toEqual({ x: 30, y: -20 });
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
