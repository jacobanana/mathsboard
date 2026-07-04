// Dialog for the Area / lattice tool.
//
// Ported from areaLatticeDialog (maths-whiteboard.html lines 450-458). The mode
// select switches between the area model (rectangle / grid method) and the
// lattice (Napier's) method; validation differs per mode.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { partition } from "@/canvas/drawHelpers";
import type { AreaLatticeParams } from "@/tools/arealattice";

export function AreaLatticeDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<AreaLatticeParams>) {
  const editing = initial != null;

  const [mode, setMode] = useState<"area" | "lattice">(
    initial ? initial.mode : "area",
  );
  const [a, setA] = useState(String(initial ? initial.a : 23));
  const [b, setB] = useState(String(initial ? initial.b : 14));
  const [err, setErr] = useState("");

  function submit() {
    const a2 = parseInt(a, 10),
      b2 = parseInt(b, 10);
    if (isNaN(a2) || isNaN(b2) || a2 < 1 || b2 < 1) {
      setErr("Enter two whole numbers.");
      return;
    }
    if (mode === "area" && partition(a2).length * partition(b2).length > 20) {
      setErr("Too many parts — try smaller numbers.");
      return;
    }
    if (
      mode === "lattice" &&
      (String(a2).length > 4 || String(b2).length > 4)
    ) {
      setErr("Use numbers up to 4 digits for lattice.");
      return;
    }
    onSubmit({ mode, a: a2, b: b2 });
  }

  return (
    <>
      <h2>Area / lattice</h2>
      <p className="hint">
        Area model is the grid method drawn as a rectangle. Lattice is the
        diagonal (Napier’s) method — sum the diagonals by hand.
      </p>

      <div className="field">
        <label htmlFor="alMode">Method</label>
        <select
          id="alMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "area" | "lattice")}
        >
          <option value="area">Area model (rectangle)</option>
          <option value="lattice">Lattice (Napier’s)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="alA">First number</label>
        <input
          id="alA"
          type="number"
          min="2"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="alB">Second number</label>
        <input
          id="alB"
          type="number"
          min="2"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
      </div>

      <p className="err" id="alErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="alCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="alAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
