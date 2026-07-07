// Settings dialog for the Flash cards tool.
//
// Conventions (see src/tools/money/Dialog.tsx): props are
// ToolDialogProps<FlashCardsParams>; the dialog renders only the card body; EDIT
// vs CREATE is decided by `initial` (Save/Cancel vs Add to board/Back). Only the
// config fields are read from `initial`; the live session state (round, idx,
// answers) is left untouched — the tool restarts the session itself on save
// (resetOnEdit), so changing settings never leaves a half-played deck.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import {
  LEVELS,
  LEVEL_LABEL,
  MAX_COUNT,
  MAX_SECONDS,
  MIN_COUNT,
  MIN_SECONDS,
  MODES,
  MODE_LABEL,
  type FlashMode,
  type Level,
} from "@/tools/flashcards/cards";
import { DEFAULT_FLASHCARDS, type FlashCardsParams } from "@/tools/flashcards";

/** The default timer length offered when the (off-by-default) timer is enabled. */
const DEFAULT_SECONDS = 20;

export function FlashCardsDialog({ initial, onSubmit, onCancel }: ToolDialogProps<FlashCardsParams>) {
  const editing = initial != null;
  const [mode, setMode] = useState<FlashMode>(initial?.mode ?? DEFAULT_FLASHCARDS.mode);
  const [level, setLevel] = useState<Level>(initial?.level ?? DEFAULT_FLASHCARDS.level);
  const [table, setTable] = useState<number>(initial?.table ?? 0);
  const [count, setCount] = useState<string>(String(initial?.count ?? DEFAULT_FLASHCARDS.count));
  const [timed, setTimed] = useState<boolean>((initial?.seconds ?? 0) > 0);
  const [seconds, setSeconds] = useState<string>(
    String(initial?.seconds && initial.seconds > 0 ? initial.seconds : DEFAULT_SECONDS),
  );

  function submit() {
    onSubmit({
      mode,
      level,
      table: mode === "times" ? table : 0,
      count: clamp(parseInt(count, 10) || DEFAULT_FLASHCARDS.count, MIN_COUNT, MAX_COUNT),
      seconds: timed
        ? clamp(parseInt(seconds, 10) || DEFAULT_SECONDS, MIN_SECONDS, MAX_SECONDS)
        : 0,
    });
  }

  return (
    <>
      <h2>Flash cards</h2>
      <p className="hint">
        One question at a time. She types the answer and flips the card to check
        it. At the end she sees how she did. Everyone sees the same cards.
      </p>

      <div className="field">
        <label>Questions</label>
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

      {mode === "times" && (
        <div className="field">
          <label htmlFor="fcTable">Which table</label>
          <select id="fcTable" value={table} onChange={(e) => setTable(parseInt(e.target.value, 10))}>
            <option value={0}>Mixed tables</option>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((k) => (
              <option key={k} value={k}>
                {k}× table
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Level</label>
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
        <label htmlFor="fcCount">How many cards</label>
        <input
          id="fcCount"
          type="number"
          min={MIN_COUNT}
          max={MAX_COUNT}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="flash-toggle">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
          <span>Timer per card</span>
        </label>
        {timed && (
          <div className="flash-secs">
            <input
              type="number"
              min={MIN_SECONDS}
              max={MAX_SECONDS}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
            <span className="flash-secs-unit">seconds each</span>
          </div>
        )}
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
