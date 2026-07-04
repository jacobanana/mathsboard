// Array / dot grid dialog.
//
// Ported from arrayDialog (maths-whiteboard.html lines 441-448). The fill row
// reuses the prototype's shared `fillRow` markup (line 389): a
// `.field.check` label with the "Fill in the answers (show a worked example)"
// caption.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import type { ArrayParams } from "@/tools/array";

export function ArrayDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<ArrayParams>) {
  const editing = initial != null;

  const [rows, setRows] = useState(String(initial ? initial.rows : 3));
  const [cols, setCols] = useState(String(initial ? initial.cols : 5));

  function submit() {
    const r = clamp(parseInt(rows, 10) || 1, 1, 12);
    const c = clamp(parseInt(cols, 10) || 1, 1, 12);
    onSubmit({ rows: r, cols: c });
  }

  return (
    <>
      <h2>Array / dot grid</h2>
      <p className="hint">
        Rows × columns of dots — shows multiplication (and grouping for
        division).
      </p>

      <div className="field">
        <label htmlFor="arR">Rows</label>
        <input
          id="arR"
          type="number"
          min="1"
          max="12"
          value={rows}
          onChange={(e) => setRows(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="arC">Columns</label>
        <input
          id="arC"
          type="number"
          min="1"
          max="12"
          value={cols}
          onChange={(e) => setCols(e.target.value)}
        />
      </div>

      <p className="err" id="arErr"></p>
      <div className="card-actions">
        <button className="btn" id="arCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="arAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
