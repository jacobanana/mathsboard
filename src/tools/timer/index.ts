// WIDGET TOOL — a shared 2D-hourglass timer: countdown or stopwatch.
//
// Renders as an interactive React overlay (the .itimer card, see Timer.tsx): a
// clean 2D vector (SVG) hourglass whose sand tracks the elapsed fraction, a
// digital hh:mm:ss readout, and a Start/Pause + Reset control strip. SETTINGS (the
// hh:mm:ss duration and the mode) are ordinary params set from the Dialog; its
// RUN STATE (running, the frozen anchorMs, the absolute anchorAt, a flipSeq
// counter) is live widget state written under INPUT_ORIGIN — so start / pause /
// reset sync to every collaborator, persist across reloads, and are
// undo-invisible, exactly like the dice's value/roll.
//
// A countdown stores an absolute anchorAt+anchorMs finish moment, so every
// client independently derives "done" and shows the board-wide alert together
// (see src/ui/TimerDoneLayer.tsx) with no extra broadcast. The hourglass shape +
// sand levels live in ./hourglass.ts (2D vector); the timer logic in ./time.ts;
// the SVG rendering and interaction in ./Timer.tsx.

import { defineWidgetTool } from "@/tools/registry";
import { Timer } from "@/tools/timer/Timer";
import { TimerDialog } from "@/tools/timer/Dialog";
import { resetPatch, type TimerMode } from "@/tools/timer/time";

export interface TimerParams {
  /** Countdown length / stopwatch nominal glass capacity (ms). Dialog param. */
  durationMs: number;
  /** Count down to zero, or up from zero. Dialog param. */
  mode: TimerMode;
  // Live widget state (NOT set from the dialog; written via updateWidgetState):
  /** Ticking now? */
  running?: boolean;
  /** Value frozen at the last start/pause (remaining/elapsed ms). */
  anchorMs?: number;
  /** Date.now() when running last became true — the absolute projection origin. */
  anchorAt?: number;
  /** Monotonic; bumped on Reset to trigger the flip-over animation on every client. */
  flipSeq?: number;
}

/** Default: a 5-minute countdown. */
export const DEFAULT_TIMER_DURATION_MS = 5 * 60 * 1000;

/** Card layout bands under the hourglass (fixed screen px; the SVG takes the
 *  rest). Shared with Timer.tsx and used to size defaultSize. */
export const READOUT_H = 30;
export const CTRL_H = 40;

const timerTool = defineWidgetTool<TimerParams>({
  kind: "widget",
  type: "timer",
  name: "Timer",
  blurb: "countdown or stopwatch",
  category: "time",
  defaults: () => ({ durationMs: DEFAULT_TIMER_DURATION_MS, mode: "countdown" }),
  // Square hourglass area (168) plus the readout + controls strips below it.
  defaultSize: { w: 168, h: 168 + READOUT_H + CTRL_H },
  // The whole render derives from obj.w/obj.h, so it resizes cleanly via the
  // WidgetHandleLayer (aspect-locked, keeping the hourglass square).
  resizable: true,
  Component: Timer,
  Dialog: TimerDialog,
  // Editing the duration/mode always resets the run (clears the anchor + bumps
  // flipSeq → the flip animation), so a settings change starts clean.
  resetOnEdit: (obj) => resetPatch(obj) as Record<string, unknown>,
});

export default timerTool;
