// Settings modal for the Times tables tool.
//
// Ported from timesDialog (maths-whiteboard.html lines 404-412). Reproduces the
// exact labels, fields, select options, mode-switching show/hide and the
// parse/clamp logic the prototype ran before calling place():
//   - grid:   n = parseInt(ttN, 10)  (no clamp; options are only 10 / 12).
//   - single: k    = clamp(parseInt(ttK, 10) || 2, 1, 20)
//             rows = clamp(parseInt(ttRows, 10) || 12, 1, 20)
//   - fill comes from the shared "Fill in the answers" checkbox.
//
// This dialog has no validation/error line in the prototype, so there is no
// .err element here.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import type { TimesTableParams } from "@/tools/timestable";

export function TimesTableDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<TimesTableParams>) {
  const editing = initial != null;

  // Seed fields mirroring the prototype: const mode=ex?ex.mode:'grid',
  // n=ex&&ex.n?ex.n:12, k=ex&&ex.k?ex.k:7, rows=ex&&ex.rows?ex.rows:12,
  // fill=ex?!!ex.fill:false.
  const ex = initial;
  const [mode, setMode] = useState<"grid" | "single">(
    ex ? ex.mode : "grid",
  );
  const [n, setN] = useState(
    String(ex && ex.mode === "grid" && ex.n ? ex.n : 12),
  );
  const [k, setK] = useState(
    String(ex && ex.mode === "single" && ex.k ? ex.k : 7),
  );
  const [rows, setRows] = useState(
    String(ex && ex.mode === "single" && ex.rows ? ex.rows : 12),
  );

  function submit() {
    if (mode === "grid") {
      onSubmit({ mode: "grid", n: parseInt(n, 10) });
    } else {
      onSubmit({
        mode: "single",
        k: clamp(parseInt(k, 10) || 2, 1, 20),
        rows: clamp(parseInt(rows, 10) || 12, 1, 20),
      });
    }
  }

  return (
    <>
      <h2>Times tables</h2>
      <p className="hint">A full square, or a single table to practise.</p>

      <div className="field">
        <label htmlFor="ttMode">Type</label>
        <select
          id="ttMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "grid" | "single")}
        >
          <option value="grid">Full grid</option>
          <option value="single">Single table</option>
        </select>
      </div>

      <div id="ttGrid" style={{ display: mode === "grid" ? "block" : "none" }}>
        <div className="field">
          <label htmlFor="ttN">Grid size</label>
          <select id="ttN" value={n} onChange={(e) => setN(e.target.value)}>
            <option value="10">10 × 10</option>
            <option value="12">12 × 12</option>
          </select>
        </div>
      </div>

      <div
        id="ttSingle"
        style={{ display: mode === "single" ? "block" : "none" }}
      >
        <div className="field">
          <label htmlFor="ttK">Which table</label>
          <input
            id="ttK"
            type="number"
            min="2"
            max="20"
            value={k}
            onChange={(e) => setK(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ttRows">Go up to</label>
          <input
            id="ttRows"
            type="number"
            min="5"
            max="20"
            value={rows}
            onChange={(e) => setRows(e.target.value)}
          />
        </div>
      </div>

      <div className="card-actions">
        <button className="btn" id="ttCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="ttAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
