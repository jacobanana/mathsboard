// Settings dialog for the Timer tool.
//
// Conventions (see src/tools/dice/Dialog.tsx, src/tools/clock/Dialog.tsx): props
// are ToolDialogProps<TimerParams>; the body only; EDIT vs CREATE is decided by
// `initial` (Save/Cancel vs Add to board/Back).
//
// Two settings — the hh:mm:ss duration and the mode (count down / stopwatch).
// The run state (running, anchorMs, anchorAt, flipSeq) is live widget state,
// never edited here, so a settings change (editObject merges params) leaves a
// running timer untouched.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import {
  type TimerMode,
  MAX_HOURS,
  MIN_COUNTDOWN_MS,
  parseHMS,
  splitHMS,
} from "@/tools/timer/time";
import { DEFAULT_TIMER_DURATION_MS, type TimerParams } from "@/tools/timer";

export function TimerDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<TimerParams>) {
  const editing = initial != null;
  const seed = splitHMS(initial?.durationMs ?? DEFAULT_TIMER_DURATION_MS);

  const [h, setH] = useState(String(seed.h));
  const [m, setM] = useState(String(seed.m));
  const [s, setS] = useState(String(seed.s));
  const [mode, setMode] = useState<TimerMode>(
    initial?.mode === "stopwatch" ? "stopwatch" : "countdown",
  );

  function submit() {
    const hh = clamp(parseInt(h, 10) || 0, 0, MAX_HOURS);
    const mm = clamp(parseInt(m, 10) || 0, 0, 59);
    const ss = clamp(parseInt(s, 10) || 0, 0, 59);
    let durationMs = parseHMS(hh, mm, ss);
    if (mode === "countdown" && durationMs < MIN_COUNTDOWN_MS) {
      durationMs = MIN_COUNTDOWN_MS;
    }
    onSubmit({ durationMs, mode });
  }

  return (
    <>
      <h2>Timer</h2>
      <p className="hint">
        {mode === "countdown"
          ? "Counts down to zero, then shows everyone a “Time’s up!”."
          : "Counts up from zero. Start / pause and reset are shared with everyone."}
      </p>

      <div className="field">
        <label>Mode</label>
        <div className="timer-mode">
          <button
            type="button"
            className={"timer-mode-btn" + (mode === "countdown" ? " active" : "")}
            onClick={() => setMode("countdown")}
          >
            Count down
          </button>
          <button
            type="button"
            className={"timer-mode-btn" + (mode === "stopwatch" ? " active" : "")}
            onClick={() => setMode("stopwatch")}
          >
            Stopwatch
          </button>
        </div>
      </div>

      {/* Stopwatch always starts from 0, so it has no duration to set. */}
      {mode === "countdown" && (
      <div className="field">
        <label>Duration (hh:mm:ss)</label>
        <div className="timer-hms">
          <input
            id="tmH"
            type="number"
            min="0"
            max={MAX_HOURS}
            aria-label="hours"
            value={h}
            onChange={(e) => setH(e.target.value)}
          />
          <span className="timer-hms-sep">:</span>
          <input
            id="tmM"
            type="number"
            min="0"
            max="59"
            aria-label="minutes"
            value={m}
            onChange={(e) => setM(e.target.value)}
          />
          <span className="timer-hms-sep">:</span>
          <input
            id="tmS"
            type="number"
            min="0"
            max="59"
            aria-label="seconds"
            value={s}
            onChange={(e) => setS(e.target.value)}
          />
        </div>
      </div>
      )}

      <div className="card-actions">
        <button className="btn" id="tmCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="tmAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
