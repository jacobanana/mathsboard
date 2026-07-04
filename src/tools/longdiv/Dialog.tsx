// Settings modal for the long-division tool.
//
// Ported from longDivDialog (maths-whiteboard.html lines 495-502). Renders only
// the card body; the host renders the #scrim / .card wrapper.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { LongDivParams } from "@/tools/longdiv";

export function LongDivDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LongDivParams>) {
  const editing = initial != null;

  const [dd, setDd] = useState(String(initial ? initial.dividend : 4928));
  const [dv, setDv] = useState(String(initial ? initial.divisor : 7));
  const [err, setErr] = useState("");

  function submit() {
    const d = parseInt(dd, 10);
    const v = parseInt(dv, 10);
    if (isNaN(d) || isNaN(v) || v < 1 || d < 0) {
      setErr("Enter a number and a divisor of 1 or more.");
      return;
    }
    if (String(d).length > 5) {
      setErr("Use up to 5 digits to keep it tidy.");
      return;
    }
    onSubmit({ dividend: d, divisor: v });
  }

  return (
    <>
      <h2>Long division</h2>
      <p className="hint">
        The full ladder (divide, multiply, subtract, bring down). Fill it for a
        worked example.
      </p>

      <div className="field">
        <label htmlFor="ldDd">Number to divide</label>
        <input
          id="ldDd"
          type="number"
          min="0"
          value={dd}
          onChange={(e) => setDd(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ldDv">Divide by</label>
        <input
          id="ldDv"
          type="number"
          min="1"
          value={dv}
          onChange={(e) => setDv(e.target.value)}
        />
      </div>

      <p className="err" id="ldErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="ldCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="ldAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
