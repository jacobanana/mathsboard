// Dialog for the long multiplication tool.
//
// Conventions (see numberline/Dialog.tsx):
//   - Props are ToolDialogProps<P>: { initial?, onSubmit, onCancel }.
//   - Renders ONLY the card body; the host renders the #scrim / .card wrapper.
//   - initial present -> editing -> "Cancel" / "Save".
//     initial absent  -> creating -> "Back"  / "Add to board".
//
// Ported from longMultDialog (maths-whiteboard.html lines 423-430).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { LongMultParams } from "@/tools/longmult";

export function LongMultDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LongMultParams>) {
  const editing = initial != null;

  const [a, setA] = useState(String(initial ? initial.a : 34));
  const [b, setB] = useState(String(initial ? initial.b : 27));
  const [err, setErr] = useState("");

  function submit() {
    const a2 = parseInt(a, 10);
    const b2 = parseInt(b, 10);
    if (isNaN(a2) || isNaN(b2) || a2 < 1 || b2 < 1) {
      setErr("Enter two whole numbers.");
      return;
    }
    if (String(b2).length > 4 || String(a2 * b2).length > 8) {
      setErr(
        "Those numbers are too big to lay out neatly — try smaller ones.",
      );
      return;
    }
    onSubmit({ a: a2, b: b2 });
  }

  return (
    <>
      <h2>Long multiplication</h2>
      <p className="hint">
        Column method, lined up. Leave blank to work through, or fill for an
        example.
      </p>

      <div className="field">
        <label htmlFor="lmA">First number</label>
        <input
          id="lmA"
          type="number"
          min="2"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="lmB">Second number</label>
        <input
          id="lmB"
          type="number"
          min="2"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>

      <p className="err" id="lmErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="lmCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="lmAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
