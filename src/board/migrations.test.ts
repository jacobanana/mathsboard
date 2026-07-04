// Load-time document upgrades. Each migration is a pure function with an
// identity contract (return the SAME reference when nothing changed) so
// migrateDocument can skip rebuilding an untouched document — these tests pin
// both the transform and that identity guarantee.

import { beforeAll, describe, expect, it } from "vitest";
import {
  bakeErasers,
  bakeFractionWalls,
  migrateDocument,
  revealFromFill,
} from "@/board/migrations";
import { newBoardDocument } from "@/board/types";
import { registerTool } from "@/tools/registry";
import chunkingTool from "@/tools/chunking";
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

describe("revealFromFill", () => {
  // The box-recompute path asks the sizing authority for the tool's natural
  // size, so register a tool that used to grow when filled (chunking).
  beforeAll(() => {
    registerTool(chunkingTool);
  });

  it("renames fill -> revealed and drops the fill field", () => {
    // Unregistered type (numberline isn't registered in this file), so the box
    // is left untouched and only the flag rename is exercised.
    const shown = anObject({ fill: true });
    const hidden = anObject({ fill: false });
    const [a, b] = revealFromFill([shown, hidden]);
    expect(a.revealed).toBe(true);
    expect("fill" in a).toBe(false);
    expect(b.revealed).toBeUndefined(); // stays hidden, no revealed field added
    expect("fill" in b).toBe(false);
  });

  it("leaves objects without a fill flag untouched (identity)", () => {
    const objs = [anObject()];
    expect(revealFromFill(objs)).toBe(objs);
  });

  it("re-reserves the box for a legacy hidden 'grow-when-filled' tool", () => {
    // A chunking saved HIDDEN carried the short 86px box; the tool now reserves
    // the full ladder height always (34 + 2*52 + 54 = 192 for 196 ÷ 14), so the
    // box is bumped to match what it now draws.
    const hidden = anObject({
      type: "chunking",
      dividend: 196,
      divisor: 14,
      w: 320,
      h: 86,
      fill: false,
    });
    const [out] = revealFromFill([hidden]);
    expect(out.w).toBe(320);
    expect(out.h).toBe(192);
    expect("fill" in out).toBe(false);
  });

  it("is idempotent once no object carries fill", () => {
    const migrated = revealFromFill([
      anObject({ type: "chunking", dividend: 196, divisor: 14, w: 320, h: 192, fill: true }),
    ]);
    expect(revealFromFill(migrated)).toBe(migrated);
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
