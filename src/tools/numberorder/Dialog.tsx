// Settings dialog for the Number order tool.
//
// Conventions (see src/tools/flashcards/Dialog.tsx): props are
// ToolDialogProps<NumberOrderParams>; the dialog renders only the card body;
// EDIT vs CREATE is decided by `initial` (Save/Cancel vs Add to board/Back).
// Only the config fields are read from `initial`; the live session state (round,
// idx, taps) is left untouched — the tool restarts the session itself on save
// (resetOnEdit), so changing settings never leaves a half-played game.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import {
  LEVELS,
  LEVEL_LABEL,
  MAX_NUMS,
  MAX_ROUNDS,
  MIN_NUMS,
  MIN_ROUNDS,
  MODES,
  MODE_LABEL,
  TARGETS,
  TARGET_LABEL,
  type Level,
  type NoMode,
  type NoTarget,
} from "@/tools/numberorder/order";
import { DEFAULT_NUMBERORDER, type NumberOrderParams } from "@/tools/numberorder";

export function NumberOrderDialog({ initial, onSubmit, onCancel }: ToolDialogProps<NumberOrderParams>) {
  const editing = initial != null;
  const [mode, setMode] = useState<NoMode>(initial?.mode ?? DEFAULT_NUMBERORDER.mode);
  const [target, setTarget] = useState<NoTarget>(initial?.target ?? DEFAULT_NUMBERORDER.target);
  const [level, setLevel] = useState<Level>(initial?.level ?? DEFAULT_NUMBERORDER.level);
  const [count, setCount] = useState<string>(String(initial?.count ?? DEFAULT_NUMBERORDER.count));
  const [rounds, setRounds] = useState<string>(String(initial?.rounds ?? DEFAULT_NUMBERORDER.rounds));

  function submit() {
    onSubmit({
      mode,
      target,
      level,
      count: clamp(parseInt(count, 10) || DEFAULT_NUMBERORDER.count, MIN_NUMS, MAX_NUMS),
      rounds: clamp(parseInt(rounds, 10) || DEFAULT_NUMBERORDER.rounds, MIN_ROUNDS, MAX_ROUNDS),
    });
  }

  return (
    <>
      <h2>Number order</h2>
      <p className="hint">
        Tap the biggest or smallest number, or put a set of numbers in order by
        tapping them one after another. It gets harder with more numbers.
        Everyone sees the same puzzles.
      </p>

      <div className="field">
        <label>Task</label>
        <div className="flash-opts">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={"flash-opt" + (mode === m ? " active" : "")}
              onClick={() => setMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{mode === "pick" ? "Find the…" : "Order from…"}</label>
        <div className="flash-opts">
          {TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              className={"flash-opt" + (target === t ? " active" : "")}
              onClick={() => setTarget(t)}
            >
              {TARGET_LABEL[mode][t]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Number size</label>
        <div className="flash-opts">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={"flash-opt" + (level === l ? " active" : "")}
              onClick={() => setLevel(l)}
            >
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="noCount">How many numbers</label>
        <input
          id="noCount"
          type="number"
          min={MIN_NUMS}
          max={MAX_NUMS}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="noRounds">How many rounds</label>
        <input
          id="noRounds"
          type="number"
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          value={rounds}
          onChange={(e) => setRounds(e.target.value)}
        />
      </div>

      <div className="card-actions">
        <button className="btn" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
