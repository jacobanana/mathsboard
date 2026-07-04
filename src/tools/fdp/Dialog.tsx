// Dialog for the FDP tool. Ported from fdpDialog
// (maths-whiteboard.html lines 551-558).
//
// Conventions (see numberline/Dialog.tsx):
//   - Props are ToolDialogProps<P>: { initial?, onSubmit, onCancel }.
//   - Renders ONLY the card body; the host renders the #scrim / .card wrapper.
//   - initial present -> editing -> buttons "Cancel" / "Save".
//     initial absent  -> creating -> buttons "Back" / "Add to board".
//   - Validate on submit; on failure set the .err text and DO NOT call onSubmit.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { FDPParams } from "@/tools/fdp";

export function FDPDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<FDPParams>) {
  const editing = initial != null;

  const [num, setNum] = useState(String(initial ? initial.num : 3));
  const [den, setDen] = useState(String(initial ? initial.den : 4));
  const [err, setErr] = useState("");

  function submit() {
    const n = parseInt(num, 10);
    const d = parseInt(den, 10);
    if (isNaN(n) || isNaN(d) || d < 1 || n < 0) {
      setErr("Enter a fraction.");
      return;
    }
    onSubmit({ num: n, den: d });
  }

  return (
    <>
      <h2>Fraction ↔ decimal ↔ %</h2>
      <p className="hint">
        Shows a fraction as a bar with its decimal and percentage. Untick to let
        her work them out.
      </p>

      <div className="field">
        <label htmlFor="fdN">Numerator (top)</label>
        <input
          id="fdN"
          type="number"
          min="0"
          value={num}
          onChange={(e) => setNum(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="fdD">Denominator (bottom)</label>
        <input
          id="fdD"
          type="number"
          min="1"
          value={den}
          onChange={(e) => setDen(e.target.value)}
        />
      </div>

      <p className="err" id="fdErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="fdCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="fdAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
