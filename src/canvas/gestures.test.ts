// The shared multi-touch registry. The behaviour that matters is the one the
// canvas could never get right on its own: two fingers make a pinch even when
// they land on DIFFERENT surfaces — one on a widget card (registered by the
// WidgetLayer), one on the board (registered by BoardCanvas) — and whatever
// single-pointer interaction was running is cancelled when they do.

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gestures from "@/canvas/gestures";
import { useBoardStore } from "@/board/store";
import { freshBoard } from "@/testing/fixtures";

const cam = () => useBoardStore.getState().camera;

beforeEach(() => {
  freshBoard();
  gestures.reset();
});

describe("the first finger", () => {
  it("is not suppressed, whoever registers it", () => {
    expect(gestures.down(1, { x: 100, y: 100 })).toBe(false);
    expect(gestures.count()).toBe(1);
    expect(gestures.pinching()).toBe(false);
  });

  it("leaves its move to the caller", () => {
    gestures.down(1, { x: 100, y: 100 });
    expect(gestures.move(1, { x: 140, y: 100 })).toBe(false);
  });

  it("ignores a pointer it never saw", () => {
    expect(gestures.move(9, { x: 0, y: 0 })).toBe(false);
    expect(gestures.up(9)).toBe(false);
  });
});

describe("a second finger, wherever it landed", () => {
  it("starts a pinch across two surfaces", () => {
    // Finger one on a widget card (the WidgetLayer registers it)...
    expect(gestures.down(1, { x: 100, y: 100 })).toBe(false);
    // ...finger two on the board (BoardCanvas registers it).
    expect(gestures.down(2, { x: 200, y: 100 })).toBe(true);
    expect(gestures.pinching()).toBe(true);
  });

  it("cancels the live single-pointer interaction of BOTH surfaces", () => {
    const cancelWidgetDrag = vi.fn();
    const cancelStroke = vi.fn();
    gestures.down(1, { x: 100, y: 100 }, cancelWidgetDrag);
    expect(cancelWidgetDrag).not.toHaveBeenCalled();
    gestures.down(2, { x: 200, y: 100 }, cancelStroke);
    expect(cancelWidgetDrag).toHaveBeenCalledTimes(1);
    expect(cancelStroke).toHaveBeenCalledTimes(1);
  });

  it("zooms the camera as the fingers spread, and consumes the moves", () => {
    gestures.down(1, { x: 100, y: 100 });
    gestures.down(2, { x: 200, y: 100 });
    const before = cam().scale;
    expect(gestures.move(2, { x: 300, y: 100 })).toBe(true); // 100px -> 200px
    expect(cam().scale).toBeCloseTo(before * 2, 5);
  });

  it("suppresses a third finger", () => {
    gestures.down(1, { x: 100, y: 100 });
    gestures.down(2, { x: 200, y: 100 });
    expect(gestures.down(3, { x: 300, y: 100 })).toBe(true);
  });
});

describe("lifting off", () => {
  it("swallows the release that ends the pinch", () => {
    gestures.down(1, { x: 100, y: 100 });
    gestures.down(2, { x: 200, y: 100 });
    expect(gestures.up(2)).toBe(true); // the caller must not end its own drag
    expect(gestures.pinching()).toBe(false);
  });

  it("stops the finger left behind starting a fresh action", () => {
    gestures.down(1, { x: 100, y: 100 });
    gestures.down(2, { x: 200, y: 100 });
    gestures.up(2);
    // One finger is still down: its moves are still not the caller's.
    expect(gestures.move(1, { x: 400, y: 400 })).toBe(true);
    expect(gestures.count()).toBe(1);
  });

  it("re-arms once every finger is up", () => {
    gestures.down(1, { x: 100, y: 100 });
    gestures.down(2, { x: 200, y: 100 });
    gestures.up(2);
    gestures.up(1);
    expect(gestures.count()).toBe(0);
    expect(gestures.down(3, { x: 10, y: 10 })).toBe(false);
  });
});

describe("the safety net", () => {
  it("frees a finger nobody reported releasing", () => {
    const drop = gestures.installSafetyNet();
    gestures.down(1, { x: 10, y: 10 }); // e.g. a press on a widget's button
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(gestures.count()).toBe(0);
    // ...so the NEXT press is a first finger again, not a phantom pinch.
    expect(gestures.down(2, { x: 10, y: 10 })).toBe(false);
    drop();
  });

  it("finds nothing to do when the owner released it properly", () => {
    const drop = gestures.installSafetyNet();
    gestures.down(1, { x: 10, y: 10 });
    expect(gestures.up(1)).toBe(false); // the owner's own release
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(gestures.count()).toBe(0);
    drop();
  });
});
