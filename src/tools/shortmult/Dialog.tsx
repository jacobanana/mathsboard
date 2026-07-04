// Dialog for the Short multiplication tool.
//
// Ported verbatim from shortMultDialog (maths-whiteboard.html lines 432-439).
// Same labels, fields, fill-in checkbox row, and validation messages.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { ShortMultParams } from "@/tools/shortmult";

export function ShortMultDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<ShortMultParams>) {
  const editing = initial != null;

  const [a, setA] = useState(String(initial ? initial.a : 236));
  const [b, setB] = useState(String(initial ? initial.b : 4));
  const [err, setErr] = useState("");

  function submit() {
    const a2 = parseInt(a, 10);
    const b2 = parseInt(b, 10);
    if (isNaN(a2) || isNaN(b2) || a2 < 1) {
      setErr("Enter a number and a single-digit multiplier.");
      return;
    }
    if (b2 < 1 || b2 > 9) {
      setErr("The multiplier should be a single digit (1–9).");
      return;
    }
    onSubmit({ a: a2, b: b2 });
  }

  return (
    <>
      <h2>Short multiplication</h2>
      <p className="hint">
        Column method for a number × a single digit, with carries.
      </p>

      <div className="field">
        <label htmlFor="smA">Number</label>
        <input
          id="smA"
          type="number"
          min="2"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="smB">× single digit (2–9)</label>
        <input
          id="smB"
          type="number"
          min="2"
          max="9"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>

      <p className="err" id="smErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="smCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="smAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
