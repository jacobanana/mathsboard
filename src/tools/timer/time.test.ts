// The timer logic: values derive correctly at any instant, the controls write
// the right patches, resume CONTINUES (never restarts), a countdown clamps at
// zero and reports a stable absolute finishAt, and hh:mm:ss round-trips.

import { describe, expect, it } from "vitest";
import {
  type TimerLive,
  currentMs,
  displaySeconds,
  finishAt,
  formatHMS,
  isFinished,
  parseHMS,
  pausePatch,
  progress,
  resetPatch,
  restingMs,
  splitHMS,
  startPatch,
} from "@/tools/timer/time";

const MIN = 60_000;

describe("resting / current value", () => {
  it("a never-started countdown rests at its full duration", () => {
    expect(restingMs("countdown", 5 * MIN, {})).toBe(5 * MIN);
    expect(currentMs("countdown", 5 * MIN, {}, 1_000)).toBe(5 * MIN);
  });

  it("a never-started stopwatch rests at zero", () => {
    expect(restingMs("stopwatch", 5 * MIN, {})).toBe(0);
    expect(currentMs("stopwatch", 5 * MIN, {}, 1_000)).toBe(0);
  });

  it("a running countdown counts down from the anchor", () => {
    const live: TimerLive = { running: true, anchorMs: 10_000, anchorAt: 1_000 };
    expect(currentMs("countdown", 60_000, live, 1_000)).toBe(10_000);
    expect(currentMs("countdown", 60_000, live, 4_000)).toBe(7_000);
  });

  it("a running stopwatch counts up from the anchor", () => {
    const live: TimerLive = { running: true, anchorMs: 2_000, anchorAt: 1_000 };
    expect(currentMs("stopwatch", 60_000, live, 6_000)).toBe(7_000);
  });

  it("a countdown clamps at zero (never negative)", () => {
    const live: TimerLive = { running: true, anchorMs: 3_000, anchorAt: 1_000 };
    expect(currentMs("countdown", 60_000, live, 9_999)).toBe(0);
    expect(isFinished("countdown", 60_000, live, 9_999)).toBe(true);
    expect(isFinished("countdown", 60_000, live, 3_000)).toBe(false);
  });
});

describe("finishAt (the shared, absolute done moment)", () => {
  it("is anchorAt + anchorMs for a running countdown", () => {
    const live: TimerLive = { running: true, anchorMs: 10_000, anchorAt: 1_000 };
    expect(finishAt("countdown", live)).toBe(11_000);
  });

  it("is null for a paused countdown and for any stopwatch", () => {
    expect(finishAt("countdown", { running: false, anchorMs: 10_000, anchorAt: 1_000 })).toBeNull();
    expect(finishAt("stopwatch", { running: true, anchorMs: 10_000, anchorAt: 1_000 })).toBeNull();
    expect(finishAt("countdown", {})).toBeNull();
  });
});

describe("controls", () => {
  it("start from rest stamps a fresh anchor at the full duration", () => {
    expect(startPatch("countdown", 30_000, {}, 5_000)).toEqual({
      running: true,
      anchorMs: 30_000,
      anchorAt: 5_000,
    });
  });

  it("pause then resume CONTINUES from where it stopped (not a restart)", () => {
    // Start a 30s countdown at t=0, run 12s, pause.
    let live: TimerLive = { ...(startPatch("countdown", 30_000, {}, 0) as TimerLive) };
    const paused = pausePatch("countdown", 30_000, live, 12_000);
    expect(paused.running).toBe(false);
    expect(paused.anchorMs).toBe(18_000); // 30 - 12 remaining, frozen
    live = { ...live, ...paused };

    // Resume 100s of wall-clock later: still 18s remaining, not the full 30s.
    const resumed = startPatch("countdown", 30_000, live, 112_000) as TimerLive;
    expect(resumed.anchorMs).toBe(18_000);
    expect(resumed.anchorAt).toBe(112_000);
    expect(currentMs("countdown", 30_000, resumed, 112_000 + 5_000)).toBe(13_000);
  });

  it("start is a no-op (null) when a countdown is already at zero", () => {
    expect(startPatch("countdown", 30_000, { anchorMs: 0 }, 5_000)).toBeNull();
  });

  it("reset clears the run fields and bumps flipSeq", () => {
    const live: TimerLive = { running: true, anchorMs: 5_000, anchorAt: 1_000, flipSeq: 2 };
    expect(resetPatch(live)).toEqual({
      running: undefined,
      anchorMs: undefined,
      anchorAt: undefined,
      flipSeq: 3,
    });
    // From no prior flipSeq it starts at 1.
    expect(resetPatch({}).flipSeq).toBe(1);
  });
});

describe("progress fraction", () => {
  it("countdown goes 0 → 1 as time elapses, clamped", () => {
    const live: TimerLive = { running: true, anchorMs: 10_000, anchorAt: 0 };
    expect(progress("countdown", 10_000, live, 0)).toBeCloseTo(0);
    expect(progress("countdown", 10_000, live, 5_000)).toBeCloseTo(0.5);
    expect(progress("countdown", 10_000, live, 99_000)).toBeCloseTo(1);
  });
});

describe("hh:mm:ss formatting", () => {
  it("splitHMS / parseHMS round-trip", () => {
    for (const [h, m, s] of [[0, 0, 30], [0, 5, 0], [1, 2, 3], [12, 59, 59]]) {
      const ms = parseHMS(h, m, s);
      expect(splitHMS(ms)).toEqual({ h, m, s });
    }
  });

  it("formats MM:SS, and H:MM:SS once hours appear", () => {
    expect(formatHMS(0)).toBe("00:00");
    expect(formatHMS(parseHMS(0, 5, 9))).toBe("05:09");
    expect(formatHMS(parseHMS(1, 2, 3))).toBe("1:02:03");
  });

  it("countdown rounds the shown second UP; stopwatch floors it", () => {
    expect(displaySeconds(4_200, true)).toBe(5); // countdown: last-second reads 05
    expect(displaySeconds(4_200, false)).toBe(4); // stopwatch: 4s elapsed
    expect(formatHMS(500, true)).toBe("00:01"); // final tick, not 00:00 early
    expect(formatHMS(0, true)).toBe("00:00");
  });
});
