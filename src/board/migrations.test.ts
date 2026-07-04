// Load-time document upgrades. Each migration is a pure function with an
// identity contract (return the SAME reference when nothing changed) so
// migrateDocument can skip rebuilding an untouched document — these tests pin
// both the transform and that identity guarantee.

import { describe, expect, it } from "vitest";
import {
  bakeErasers,
  bakeFractionWalls,
  migrateDocument,
} from "@/board/migrations";
import { newBoardDocument } from "@/board/types";
import { aStroke, anObject } from "@/testing/fixtures";

describe("bakeErasers", () => {
  it("folds legacy overlay erasers into geometry and is idempotent", () => {
    const pen = aStroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    const eraser = aStroke({
      mode: "eraser",
      points: [{ x: 50, y: -20 }, { x: 50, y: 20 }],
      size: 20,
    });

    const baked = bakeErasers([pen, eraser]);
    expect(baked.every((s) => s.mode === "pen")).toBe(true);
    expect(baked).toHaveLength(2); // the pen split into two fragments

    // Idempotent: with no erasers left, the SAME array comes back.
    expect(bakeErasers(baked)).toBe(baked);
    const pensOnly = [aStroke()];
    expect(bakeErasers(pensOnly)).toBe(pensOnly);
  });
});

describe("bakeFractionWalls", () => {
  it("rewrites legacy wall fractions to the fractionwall tool and is idempotent", () => {
    const wall = anObject({
      type: "fraction",
      mode: "wall",
      max: 10,
      w: 480,
      h: 340,
      order: 3,
    });
    const other = anObject({ type: "fraction", mode: "bars" });

    const baked = bakeFractionWalls([wall, other]);
    const migrated = baked.find((o) => o.id === wall.id)!;
    expect(migrated.type).toBe("fractionwall");
    expect(migrated.max).toBe(10);
    expect(migrated.order).toBe(3); // z-order preserved
    expect({ x: migrated.x, y: migrated.y, w: migrated.w, h: migrated.h })
      .toEqual({ x: wall.x, y: wall.y, w: 480, h: 340 }); // geometry unchanged
    expect(migrated.mode).toBeUndefined(); // wall-only fields dropped
    // Non-wall objects are left untouched.
    expect(baked.find((o) => o.id === other.id)).toBe(other);

    // Idempotent: with no wall fractions left, the SAME array comes back.
    expect(bakeFractionWalls(baked)).toBe(baked);
  });
});

describe("migrateDocument", () => {
  it("returns the SAME document when nothing needs upgrading", () => {
    const doc = {
      ...newBoardDocument(),
      objects: [anObject()],
      strokes: [aStroke()],
    };
    expect(migrateDocument(doc)).toBe(doc);
  });

  it("upgrades strokes and objects together in one pass", () => {
    const doc = {
      ...newBoardDocument(),
      objects: [anObject({ type: "fraction", mode: "wall", max: 6 })],
      strokes: [
        aStroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }),
        aStroke({
          mode: "eraser",
          points: [{ x: 50, y: -20 }, { x: 50, y: 20 }],
          size: 20,
        }),
      ],
    };

    const out = migrateDocument(doc);
    expect(out).not.toBe(doc);
    expect(out.objects[0].type).toBe("fractionwall");
    expect(out.strokes.every((s) => s.mode === "pen")).toBe(true);
  });
});
