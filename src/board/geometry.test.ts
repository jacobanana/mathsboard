// Pure geometry: coordinate mapping, hit-testing and the geometric-eraser
// point maths. Table-style tests pinning the contracts the interaction layer
// builds on (top-most wins, eraser strokes are untouchable, half-open rect
// edges, the eraseStrokeRuns null/[]/fragments protocol).

import { describe, expect, it } from "vitest";
import {
  clamp,
  eraseStrokeRuns,
  hitTest,
  hitTestStroke,
  normRect,
  objectInRect,
  rectsIntersect,
  screenToWorld,
  strokeBounds,
  strokeInRect,
  worldToScreen,
} from "@/board/geometry";
import { anObject, aStroke } from "@/testing/fixtures";

describe("coordinate mapping", () => {
  it("screenToWorld and worldToScreen are inverses for any camera", () => {
    const cam = { x: 37, y: -12, scale: 1.7 };
    const w = screenToWorld(cam, 300, 200);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(300, 9);
    expect(s.y).toBeCloseTo(200, 9);
  });

  it("clamp bounds a value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("hitTest (objects)", () => {
  it("the visually top object wins where boxes overlap", () => {
    const below = anObject({ x: 0, y: 0, w: 100, h: 100 });
    const above = anObject({ x: 50, y: 50, w: 100, h: 100 });
    expect(hitTest([below, above], 75, 75)?.id).toBe(above.id);
    expect(hitTest([below, above], 25, 25)?.id).toBe(below.id);
  });

  it("hits within the 6px margin around the box, misses beyond it", () => {
    const o = anObject({ x: 100, y: 100, w: 50, h: 50 });
    expect(hitTest([o], 95, 120)?.id).toBe(o.id); // 5px outside
    expect(hitTest([o], 93, 120)).toBeNull(); // 7px outside
  });
});

describe("hitTestStroke", () => {
  const line = aStroke({
    size: 6,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  });

  it("hits within half the stroke width + 6px, misses beyond", () => {
    expect(hitTestStroke([line], 50, 8)?.id).toBe(line.id); // 8 <= 3+6
    expect(hitTestStroke([line], 50, 10)).toBeNull();
  });

  it("never hits eraser strokes", () => {
    const eraser = aStroke({ mode: "eraser", points: line.points });
    expect(hitTestStroke([eraser], 50, 0)).toBeNull();
  });

  it("supports single-point strokes (dots)", () => {
    const dot = aStroke({ size: 6, points: [{ x: 10, y: 10 }] });
    expect(hitTestStroke([dot], 12, 12)?.id).toBe(dot.id);
    expect(hitTestStroke([dot], 30, 30)).toBeNull();
  });

  it("the visually top stroke wins", () => {
    const under = aStroke({ points: line.points });
    const over = aStroke({ points: line.points });
    expect(hitTestStroke([under, over], 50, 0)?.id).toBe(over.id);
  });
});

describe("strokeBounds", () => {
  it("pads the point bounds by half the stroke width", () => {
    const s = { size: 10, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] };
    expect(strokeBounds(s)).toEqual({ x: 5, y: 15, w: 30, h: 30 });
  });

  it("is a zero rect for an empty stroke", () => {
    expect(strokeBounds({ size: 10, points: [] })).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  });
});

describe("eraseStrokeRuns", () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  it("returns null when the eraser never touched the stroke", () => {
    expect(eraseStrokeRuns(line, [{ x: 500, y: 500 }], 10)).toBeNull();
  });

  it("returns [] when the whole stroke is covered (delete it)", () => {
    expect(eraseStrokeRuns(line, [{ x: 50, y: 0 }], 200)).toEqual([]);
  });

  it("returns the surviving fragments when the middle is erased", () => {
    const runs = eraseStrokeRuns(
      line,
      [{ x: 50, y: -20 }, { x: 50, y: 20 }],
      10,
    )!;
    expect(runs).toHaveLength(2);
    expect(Math.max(...runs[0].map((p) => p.x))).toBeLessThan(50);
    expect(Math.min(...runs[1].map((p) => p.x))).toBeGreaterThan(50);
  });

  it("densifies sparse strokes so the eraser cannot slip between points", () => {
    // Two points 100 apart; a tiny eraser touching only the midpoint.
    const runs = eraseStrokeRuns(line, [{ x: 50, y: 0 }], 3)!;
    expect(runs).toHaveLength(2); // still split, not missed
  });
});

describe("rect selection helpers", () => {
  it("normRect normalises reversed corners", () => {
    expect(normRect(100, 80, 20, 30)).toEqual({ x: 20, y: 30, w: 80, h: 50 });
  });

  it("rectsIntersect excludes rects that merely touch edges", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsIntersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsIntersect(a, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(objectInRect({ x: 5, y: 5, w: 10, h: 10 }, a)).toBe(true);
  });

  it("strokeInRect is half-open on the right/bottom edges", () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    const at = (x: number, y: number) => aStroke({ points: [{ x, y }] });
    expect(strokeInRect(at(0, 0), r)).toBe(true); // left/top edge included
    expect(strokeInRect(at(10, 5), r)).toBe(false); // right edge excluded
    expect(strokeInRect(at(5, 10), r)).toBe(false); // bottom edge excluded
  });
});
