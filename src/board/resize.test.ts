// Resize math + policy: the aspect-locked box derivation for handle drags,
// the minimum-size clamp, and which selections show handles at all.

import { describe, expect, it } from "vitest";
import "@/tools";
import {
  MIN_OBJ,
  RESIZE_CURSOR,
  resizeRect,
  singleResizableObject,
} from "@/board/resize";
import { RESIZE_HANDLES } from "@/board/geometry";
import { id as newId } from "@/board/types";
import { anObject } from "@/testing/fixtures";

// A 2:1 box makes derived-axis assertions easy to read.
const box = { x: 100, y: 100, w: 200, h: 100 };

describe("resizeRect", () => {
  it("SE corner drag anchors the NW corner and keeps the aspect ratio", () => {
    const r = resizeRect(box, "se", 500, 150); // width moved furthest
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    expect(r.w).toBe(400);
    expect(r.h).toBe(200); // derived from the 2:1 ratio
  });

  it("NW corner drag anchors the SE corner", () => {
    const r = resizeRect(box, "nw", 50, 80);
    expect(r.x + r.w).toBe(300); // SE corner fixed
    expect(r.y + r.h).toBe(200);
    expect(r.w / r.h).toBeCloseTo(2, 9);
  });

  it("edge drags derive the other axis and keep the box centred on it", () => {
    const e = resizeRect(box, "e", 500, 0); // width drives
    expect(e.w).toBe(400);
    expect(e.h).toBe(200);
    expect(e.y + e.h / 2).toBe(150); // vertical centreline unchanged

    const s = resizeRect(box, "s", 0, 300); // height drives
    expect(s.h).toBe(200);
    expect(s.w).toBe(400);
    expect(s.x + s.w / 2).toBe(200); // horizontal centreline unchanged
  });

  it("never shrinks below MIN_OBJ, still keeping the aspect", () => {
    const r = resizeRect(box, "se", -500, -500);
    expect(r.w).toBeGreaterThanOrEqual(MIN_OBJ);
    expect(r.h).toBeGreaterThanOrEqual(MIN_OBJ);
    expect(r.w / r.h).toBeCloseTo(2, 9);
  });

  it("every handle has a cursor", () => {
    for (const h of RESIZE_HANDLES) {
      expect(RESIZE_CURSOR[h]).toBeTruthy();
    }
  });
});

describe("singleResizableObject", () => {
  const canvasObj = anObject(); // numberline: a canvas tool
  const widgetObj = {
    id: newId(),
    type: "worksheet",
    x: 0,
    y: 0,
    w: 300,
    h: 200,
  };
  const objects = [canvasObj, widgetObj];

  it("returns the lone selected canvas object", () => {
    const sel = { objectIds: [canvasObj.id], strokeIds: [] };
    expect(singleResizableObject(objects, sel)?.id).toBe(canvasObj.id);
  });

  it("returns null for widgets (their handles would be occluded)", () => {
    const sel = { objectIds: [widgetObj.id], strokeIds: [] };
    expect(singleResizableObject(objects, sel)).toBeNull();
  });

  it("returns null for multi-selections or when a stroke is included", () => {
    expect(
      singleResizableObject(objects, {
        objectIds: [canvasObj.id, widgetObj.id],
        strokeIds: [],
      }),
    ).toBeNull();
    expect(
      singleResizableObject(objects, {
        objectIds: [canvasObj.id],
        strokeIds: ["s1"],
      }),
    ).toBeNull();
  });
});
