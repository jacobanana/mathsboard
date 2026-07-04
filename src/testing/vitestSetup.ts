// Vitest environment shims. Loaded before every test file (see
// vitest.config.ts).
//
// jsdom has no 2D canvas: getContext("2d") returns null unless the native
// `canvas` package is installed. The only module-load-time consumer is
// drawHelpers' offscreen measuring context (textSizeOf / noteSize), so we stub
// just enough for MEASUREMENT: a `font` field and a deterministic
// measureText (8px per character). Text metrics are therefore approximate in
// tests — assert that boxes grow/shrink/track size, never exact pixel widths.
// Real text layout stays covered by the Playwright suite.

import { afterEach } from "vitest";
import { cancelScheduledDraftSave } from "@/board/store";

const measureStub = {
  font: "",
  measureText: (s: string) => ({ width: s.length * 8 }),
};

HTMLCanvasElement.prototype.getContext = function getContext() {
  return measureStub;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Any document edit schedules the store's 400ms debounced draft autosave.
// A test file finishes in milliseconds, so the last edit's timer would fire
// AFTER the jsdom environment is torn down and crash on the missing
// localStorage. Cancel it while the world still exists; tests that assert on
// the autosave advance fake timers explicitly before this runs.
afterEach(() => {
  cancelScheduledDraftSave();
});
