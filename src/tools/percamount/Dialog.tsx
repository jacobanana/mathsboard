// Settings modal for the "Percentage of an amount" tool.
//
// Ported from percAmountDialog (maths-whiteboard.html lines 542-549) and the
// shared fillRow helper (line 389). Renders ONLY the card body; the host owns
// the #scrim / .card wrapper. EDIT vs CREATE is decided by `initial`.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { PercAmountParams } from "@/tools/percamount";

export function PercAmountDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<PercAmountParams>) {
  const editing = initial != null;

  const [pct, setPct] = useState(String(initial ? initial.pct : 15));
  const [whole, setWhole] = useState(String(initial ? initial.whole : 80));
  const [err, setErr] = useState("");

  function submit() {
    const p = parseFloat(pct);
    const w = parseFloat(whole);
    if (Number.isNaN(p) || Number.isNaN(w)) {
      setErr("Enter the percentage and the amount.");
      return;
    }
    onSubmit({ pct: p, whole: w });
  }

  return (
    <>
      <h2>Percentage of an amount</h2>
      <p className="hint">Method: find 10% and 1%, then build up.</p>

      <div className="field">
        <label htmlFor="paP">Percentage</label>
        <input
          id="paP"
          type="number"
          min="0"
          step="any"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="paW">Of this amount</label>
        <input
          id="paW"
          type="number"
          min="0"
          step="any"
          value={whole}
          onChange={(e) => setWhole(e.target.value)}
        />
      </div>

      <p className="err" id="paErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="paCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="paAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
