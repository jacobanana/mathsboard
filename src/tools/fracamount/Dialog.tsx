// Dialog for the "Fraction of an amount" tool.
//
// Ported verbatim from maths-whiteboard.html fracAmountDialog (lines 532-540)
// and the shared fillRow helper (line 389). Same labels, same min/step attrs,
// same validation message, same parsing (parseInt for num/den, parseFloat for
// whole). Renders only the card body; the host owns the #scrim / .card wrapper.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { FracAmountParams } from "@/tools/fracamount";

export function FracAmountDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<FracAmountParams>) {
  const editing = initial != null;

  const [num, setNum] = useState(String(initial ? initial.num : 3));
  const [den, setDen] = useState(String(initial ? initial.den : 4));
  const [whole, setWhole] = useState(String(initial ? initial.whole : 20));
  const [err, setErr] = useState("");

  function submit() {
    const n = parseInt(num, 10);
    const d = parseInt(den, 10);
    const w = parseFloat(whole);
    if (isNaN(n) || isNaN(d) || isNaN(w) || d < 1 || n < 1) {
      setErr("Enter the fraction and the amount.");
      return;
    }
    onSubmit({ num: n, den: d, whole: w });
  }

  return (
    <>
      <h2>Fraction of an amount</h2>
      <p className="hint">Method: divide by the bottom, times by the top.</p>

      <div className="field">
        <label htmlFor="faN">Numerator (top)</label>
        <input
          id="faN"
          type="number"
          min="1"
          value={num}
          onChange={(e) => setNum(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="faD">Denominator (bottom)</label>
        <input
          id="faD"
          type="number"
          min="1"
          value={den}
          onChange={(e) => setDen(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="faW">Of this amount</label>
        <input
          id="faW"
          type="number"
          min="0"
          step="any"
          value={whole}
          onChange={(e) => setWhole(e.target.value)}
        />
      </div>

      <p className="err" id="faErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="faCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="faAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
