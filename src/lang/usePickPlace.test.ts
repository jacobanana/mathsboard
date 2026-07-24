// The pure hit-test behind usePickPlace: which target rect a drop lands on.

import { describe, expect, it } from "vitest";
import { hitTarget } from "@/lang/usePickPlace";

const r = (left: number, top: number, w = 100, h = 40) => ({
  id: `${left},${top}`,
  rect: { left, top, right: left + w, bottom: top + h },
});

describe("hitTarget", () => {
  it("returns the target under the point", () => {
    const targets = [r(0, 0), r(200, 0)];
    expect(hitTarget(targets, 50, 20)).toBe("0,0");
    expect(hitTarget(targets, 250, 20)).toBe("200,0");
  });

  it("returns null when the point misses every target", () => {
    expect(hitTarget([r(0, 0)], 500, 500)).toBeNull();
  });

  it("includes the edges (inclusive bounds)", () => {
    const t = [r(0, 0, 100, 40)];
    expect(hitTarget(t, 0, 0)).toBe("0,0");
    expect(hitTarget(t, 100, 40)).toBe("0,0");
    expect(hitTarget(t, 101, 40)).toBeNull();
  });

  it("skips disabled targets", () => {
    const targets = [{ ...r(0, 0), disabled: true }];
    expect(hitTarget(targets, 50, 20)).toBeNull();
  });

  it("last matching target wins (topmost paint order)", () => {
    // Two overlapping targets; the later one is on top.
    const targets = [r(0, 0, 100, 100), { ...r(0, 0, 100, 100), id: "top" }];
    expect(hitTarget(targets, 50, 50)).toBe("top");
  });
});
