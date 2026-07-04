// Chunking settings modal.
//
// Ported verbatim from chunkingDialog (maths-whiteboard.html lines 504-511).
// Renders only the card body; the host renders the #scrim / .card wrapper.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { ChunkingParams } from "@/tools/chunking";

export function ChunkingDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<ChunkingParams>) {
  const editing = initial != null;

  const [dividend, setDividend] = useState(
    String(initial ? initial.dividend : 196),
  );
  const [divisor, setDivisor] = useState(
    String(initial ? initial.divisor : 14),
  );
  const [err, setErr] = useState("");

  function submit() {
    const d = parseInt(dividend, 10);
    const v = parseInt(divisor, 10);
    if (isNaN(d) || isNaN(v) || v < 1 || d < 1) {
      setErr("Enter a number and a divisor of 1 or more.");
      return;
    }
    onSubmit({ dividend: d, divisor: v });
  }

  return (
    <>
      <h2>Chunking</h2>
      <p className="hint">
        Division by repeatedly subtracting friendly multiples. Fill it for a
        worked example.
      </p>

      <div className="field">
        <label htmlFor="ckDd">Number to divide</label>
        <input
          id="ckDd"
          type="number"
          min="1"
          value={dividend}
          onChange={(e) => setDividend(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ckDv">Divide by</label>
        <input
          id="ckDv"
          type="number"
          min="1"
          value={divisor}
          onChange={(e) => setDivisor(e.target.value)}
        />
      </div>

      <p className="err" id="ckErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="ckCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="ckAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
