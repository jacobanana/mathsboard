// Fraction wall settings dialog.
//
// One field: how far down the wall goes (the largest denominator). Mirrors the
// former fractionDialog "wall" branch (maths-whiteboard.html lines 477-493):
// same label, select options, and the parseInt on submit.
//
// Conventions (per registry.ts ToolDialogProps):
//   initial present -> EDIT -> buttons "Cancel"/"Save".
//   initial absent  -> CREATE -> buttons "Back"/"Add to board".

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { FractionWallParams } from "@/tools/fractionwall";

export function FractionWallDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<FractionWallParams>) {
  const editing = initial != null;
  const [maxV, setMaxV] = useState(String(initial ? initial.max : 8));

  return (
    <>
      <h2>Fraction wall</h2>
      <p className="hint">
        Rows of unit fractions — one whole, halves, thirds, and so on.
      </p>

      <div className="field">
        <label htmlFor="fwMax">Rows down to</label>
        <select
          id="fwMax"
          value={maxV}
          onChange={(e) => setMaxV(e.target.value)}
        >
          <option value="6">halves … sixths</option>
          <option value="8">halves … eighths</option>
          <option value="10">halves … tenths</option>
          <option value="12">halves … twelfths</option>
        </select>
      </div>

      <div className="card-actions">
        <button className="btn" id="fwCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button
          className="btn primary"
          id="fwAdd"
          onClick={() => onSubmit({ max: parseInt(maxV, 10) })}
        >
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
