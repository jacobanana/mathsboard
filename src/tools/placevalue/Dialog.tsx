// Place-value settings dialog. Replaces the old preset-set <select> with:
//   - a MODE picker (fill / words↔number / decompose),
//   - a SLIDER for the largest integer place (Ones → Billions),
//   - a decimals picker (none / tenths / hundredths / thousandths),
//   - and, for the quiz modes, a target number + a shuffle button.
//
// Conventions match the other tool dialogs (see shape/Dialog.tsx): renders only
// the card body; EDIT vs CREATE is decided by `initial` (Save/Cancel vs Add to
// board/Back). onSubmit emits the new params — never the legacy { key, cols }.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import type { PlaceValueMode, PlaceValueParams } from "@/tools/placevalue";
import { PLACE_NAMES, toWords } from "@/tools/placevalue/words";

const MODE_LABELS: [PlaceValueMode, string][] = [
  ["fill", "Fill in"],
  ["wordsToNum", "Words → number"],
  ["numToWords", "Number → words"],
  ["decompose", "Break apart"],
];

const DECIMAL_LABELS = ["none", "tenths", "hundredths", "thousandths"];

/** A random target within `places` integer + `dec` decimal columns. */
function randomTarget(places: number, dec: number): string {
  const intPart = Math.floor(Math.random() * Math.pow(10, places));
  if (dec === 0) return String(intPart);
  const fracMax = Math.pow(10, dec);
  return String(intPart + Math.floor(Math.random() * fracMax) / fracMax);
}

export function PlaceValueDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<PlaceValueParams>) {
  const editing = initial != null;

  const [mode, setMode] = useState<PlaceValueMode>(initial?.mode ?? "fill");
  const [places, setPlaces] = useState(clamp(Math.round(initial?.places ?? 4), 1, 10));
  const [decimals, setDecimals] = useState(clamp(Math.round(initial?.decimals ?? 0), 0, 3));
  const [target, setTarget] = useState(initial?.target != null ? String(initial.target) : "");
  const [err, setErr] = useState("");

  const isQuiz = mode !== "fill";
  const decDisabled = mode === "decompose";
  const effDecimals = decDisabled ? 0 : decimals;

  function pickMode(m: PlaceValueMode): void {
    setMode(m);
    setErr("");
    // Seed a target when entering a quiz mode with none set, so the preview and
    // the placed object are meaningful straight away.
    if (m !== "fill" && target.trim() === "") {
      setTarget(randomTarget(places, m === "decompose" ? 0 : decimals));
    }
  }

  function shuffle(): void {
    setTarget(randomTarget(places, effDecimals));
    setErr("");
  }

  function submit(): void {
    const next: PlaceValueParams = { mode, places, decimals: effDecimals };
    if (isQuiz) {
      const t = Number(target);
      if (target.trim() === "" || !Number.isFinite(t) || t < 0) {
        setErr("Enter a number to make (0 or more).");
        return;
      }
      if (Math.trunc(Math.abs(t)) >= Math.pow(10, places)) {
        setErr(
          `That number is too big for ${PLACE_NAMES[places - 1]} — add more columns or pick a smaller number.`,
        );
        return;
      }
      next.target = t;
    }
    onSubmit(next);
  }

  const targetNum = Number(target);
  const previewOk = target.trim() !== "" && Number.isFinite(targetNum) && targetNum >= 0;

  return (
    <>
      <h2>Place value</h2>
      <p className="hint">
        Choose an activity, set how many columns and decimals to show, then place
        it on the board.
      </p>

      <div className="field" style={{ display: "block" }}>
        <label>Activity</label>
        <div className="pv-seg">
          {MODE_LABELS.map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={"btn" + (mode === m ? " active" : "")}
              onClick={() => pickMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="pvPlaces">Up to {PLACE_NAMES[places - 1]}</label>
        <input
          id="pvPlaces"
          type="range"
          min={1}
          max={10}
          step={1}
          value={places}
          onChange={(e) => {
            setPlaces(Number(e.target.value));
            setErr("");
          }}
        />
      </div>

      <div className="field" style={{ display: "block" }}>
        <label>Decimal places</label>
        <div className="pv-seg">
          {DECIMAL_LABELS.map((label, d) => (
            <button
              key={label}
              type="button"
              disabled={decDisabled}
              className={"btn" + (!decDisabled && decimals === d ? " active" : "")}
              onClick={() => setDecimals(d)}
            >
              {label}
            </button>
          ))}
        </div>
        {decDisabled && (
          <p className="hint" style={{ margin: "4px 0 0" }}>
            Breaking apart works on whole numbers.
          </p>
        )}
      </div>

      {isQuiz && (
        <div className="field" style={{ display: "block" }}>
          <label htmlFor="pvTarget">Number to make</label>
          <div className="pv-target">
            <input
              id="pvTarget"
              type="text"
              inputMode="decimal"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setErr("");
              }}
            />
            <button type="button" className="btn" onClick={shuffle}>
              Shuffle
            </button>
          </div>
          {previewOk && (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              In words: {toWords(targetNum, effDecimals)}
            </p>
          )}
        </div>
      )}

      <p className="err" id="pvErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="pvCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="pvAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
