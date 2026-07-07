// Timer logic — pure, no React, no DOM. The single source of truth for what a
// timer reads at any instant and what each control writes.
//
// The split (see the dice): PARAMS (durationMs, mode) are undoable settings from
// the Dialog; LIVE STATE (running, anchorMs, anchorAt, flipSeq) is written via
// updateWidgetState (INPUT_ORIGIN) — synced, persisted, undo-invisible, absent
// until first started. Because there is no server clock in the app, a countdown
// that must finish "together" stores an ABSOLUTE Date.now() anchor and every
// client derives the finish from it: finishAt = anchorAt + anchorMs. There is no
// write on finish — the finished state is derived (currentMs clamps to 0), so a
// late join or reload shows the same thing with no write-storm.

export type TimerMode = "countdown" | "stopwatch";

/** Live run state (all optional — absent means "never started / just reset"). */
export interface TimerLive {
  /** Ticking now? */
  running?: boolean;
  /** Value frozen at the last start/pause: remaining (countdown) / elapsed
   *  (stopwatch), in ms. Absent ⇒ derive the resting value from the params. */
  anchorMs?: number;
  /** Date.now() when `running` last became true — the projection origin. */
  anchorAt?: number;
  /** Monotonic; bumped ONLY on Reset, to trigger the flip-over animation. */
  flipSeq?: number;
}

/** Shortest countdown the Dialog allows. */
export const MIN_COUNTDOWN_MS = 1000;
/** Hours cap in the Dialog (keeps the readout to H:MM:SS). */
export const MAX_HOURS = 99;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** The value a paused/never-started timer shows: the frozen anchor if present,
 *  else the param default (full duration for a countdown, zero for a stopwatch). */
export function restingMs(
  mode: TimerMode,
  durationMs: number,
  live: TimerLive,
): number {
  if (live.anchorMs != null) return live.anchorMs;
  return mode === "countdown" ? durationMs : 0;
}

/** The timer's value right now (ms). Countdown clamps at 0. */
export function currentMs(
  mode: TimerMode,
  durationMs: number,
  live: TimerLive,
  now: number,
): number {
  if (live.running && live.anchorMs != null && live.anchorAt != null) {
    const elapsed = Math.max(0, now - live.anchorAt);
    return mode === "countdown"
      ? Math.max(0, live.anchorMs - elapsed)
      : live.anchorMs + elapsed;
  }
  return restingMs(mode, durationMs, live);
}

/** Absolute wall-clock (ms) a RUNNING countdown reaches zero, or null when the
 *  timer isn't a running countdown. Used to fire the board-wide "done" alert. */
export function finishAt(mode: TimerMode, live: TimerLive): number | null {
  if (mode !== "countdown") return null;
  if (!live.running || live.anchorMs == null || live.anchorAt == null) return null;
  return live.anchorAt + live.anchorMs;
}

/** A running countdown that has reached zero. */
export function isFinished(
  mode: TimerMode,
  durationMs: number,
  live: TimerLive,
  now: number,
): boolean {
  return (
    mode === "countdown" &&
    !!live.running &&
    currentMs(mode, durationMs, live, now) <= 0
  );
}

/** Elapsed fraction 0..1 for the hourglass sand. Countdown = elapsed/duration.
 *  A stopwatch has no bound, so it cycles the nominal glass every `durationMs`
 *  purely as a "running" hint (the digital readout is authoritative). */
export function progress(
  mode: TimerMode,
  durationMs: number,
  live: TimerLive,
  now: number,
): number {
  const cur = currentMs(mode, durationMs, live, now);
  if (durationMs <= 0) return mode === "countdown" ? 1 : 0;
  if (mode === "countdown") return clamp01(1 - cur / durationMs);
  return clamp01((cur % durationMs) / durationMs);
}

// --- control actions: the exact updateWidgetState patch each button writes ----

/** Start / resume. Keeps the frozen anchorMs (resume continues; it does not
 *  restart), stamps a fresh anchorAt. Returns null — a no-op — when a countdown
 *  is already at zero (the user must Reset first). */
export function startPatch(
  mode: TimerMode,
  durationMs: number,
  live: TimerLive,
  now: number,
): TimerLive | null {
  if (mode === "countdown" && restingMs(mode, durationMs, live) <= 0) return null;
  return { running: true, anchorMs: restingMs(mode, durationMs, live), anchorAt: now };
}

/** Pause: freeze the current value, stop ticking. */
export function pausePatch(
  mode: TimerMode,
  durationMs: number,
  live: TimerLive,
  now: number,
): TimerLive {
  return { running: false, anchorMs: currentMs(mode, durationMs, live, now), anchorAt: now };
}

/** Reset: DELETE the run fields (undefined prunes them under INPUT_ORIGIN) so
 *  the value derives from the params again, and bump flipSeq to flip the glass. */
export function resetPatch(live: TimerLive): TimerLive {
  return {
    running: undefined,
    anchorMs: undefined,
    anchorAt: undefined,
    flipSeq: (live.flipSeq ?? 0) + 1,
  };
}

// --- hh:mm:ss formatting ------------------------------------------------------

/** Split ms into whole {h, m, s} (rounded to the nearest second) for the Dialog. */
export function splitHMS(ms: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/** Combine hh:mm:ss fields into ms. */
export function parseHMS(h: number, m: number, s: number): number {
  return (h * 3600 + m * 60 + s) * 1000;
}

/** Whole seconds shown for `ms`: countdowns round UP (the last second reads
 *  00:01, hitting 00:00 exactly at zero); stopwatches floor (00:00 until 1s). */
export function displaySeconds(ms: number, roundUp: boolean): number {
  const secs = Math.max(0, ms) / 1000;
  return roundUp ? Math.ceil(secs) : Math.floor(secs);
}

/** Format ms as "H:MM:SS" (hours present) or "MM:SS". See displaySeconds. */
export function formatHMS(ms: number, roundUp = false): string {
  const total = displaySeconds(ms, roundUp);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
