// Settings dialog for the Multiplication grid tool.
//
// Conventions (see src/tools/numberline/Dialog.tsx):
//   - Props are ToolDialogProps<P>: { initial?, onSubmit, onCancel }.
//   - Renders ONLY the card body; the host renders the #scrim / .card wrapper.
//   - EDIT vs CREATE decided by `initial`:
//       present -> editing  -> buttons "Cancel" / "Save".
//       absent  -> creating -> buttons "Back"   / "Add to board".
//   - Validate on submit. On failure, set the .err text and DO NOT call onSubmit.
//
// Ported from gridMethodDialog (maths-whiteboard.html lines 414-421).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { partition } from "@/canvas/drawHelpers";
import type { GridMethodParams } from "@/tools/gridmethod";

export function GridMethodDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<GridMethodParams>) {
  const editing = initial != null;

  const [a, setA] = useState(String(initial ? initial.a : 34));
  const [b, setB] = useState(String(initial ? initial.b : 6));
  const [err, setErr] = useState("");

  function submit() {
    const a2 = parseInt(a, 10);
    const b2 = parseInt(b, 10);
    if (isNaN(a2) || isNaN(b2) || a2 < 1 || b2 < 1) {
      setErr("Enter two whole numbers.");
      return;
    }
    if (partition(a2).length * partition(b2).length > 20) {
      setErr("That makes too big a grid — try smaller numbers.");
      return;
    }
    onSubmit({ a: a2, b: b2 });
  }

  return (
    <>
      <h2>Multiplication grid</h2>
      <p className="hint">
        Splits the numbers into a box (grid) method layout.
      </p>

      <div className="field">
        <label htmlFor="gmA">First number</label>
        <input
          id="gmA"
          type="number"
          min="2"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="gmB">Second number</label>
        <input
          id="gmB"
          type="number"
          min="2"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>

      <p className="err" id="gmErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="gmCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="gmAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
