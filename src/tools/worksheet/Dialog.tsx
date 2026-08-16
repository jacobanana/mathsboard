// WIDGET DIALOG — the worksheet settings form.
//
// Conventions (ToolDialogProps): renders only the card body; the host renders
// the #scrim / .card wrapper. `initial` present -> editing (Cancel / Save),
// absent -> creating (Back / Add to board). On submit we build the stored
// Params shape WITH freshly generated questions (mirroring addWorksheet /
// updateWorksheet, which always call genQuestions on the new config).
//
// Ported from worksheetDialog (maths-whiteboard.html lines 595-604).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { genQuestions, type WorksheetParams } from "@/tools/worksheet";

export function WorksheetDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<WorksheetParams>) {
  const editing = initial != null;

  const [mode, setMode] = useState<"times" | "ops">(initial?.mode ?? "times");
  const [k, setK] = useState(String(initial?.k ?? 7));
  const [rows, setRows] = useState(String(initial?.rows ?? 12));
  const [op, setOp] = useState(initial?.op ?? "+");
  const [n, setN] = useState(String(initial?.n ?? 10));
  const [max, setMax] = useState(String(initial?.max ?? 12));

  function submit() {
    let cfg: WorksheetParams;
    if (mode === "times") {
      cfg = {
        mode: "times",
        k: clamp(parseInt(k, 10) || 2, 1, 20),
        rows: clamp(parseInt(rows, 10) || 12, 1, 20),
        questions: [],
      };
    } else {
      cfg = {
        mode: "ops",
        op,
        n: clamp(parseInt(n, 10) || 10, 1, 20),
        max: parseInt(max, 10),
        questions: [],
      };
    }
    cfg.questions = genQuestions(cfg);
    onSubmit(cfg);
  }

  return (
    <>
      <h2>Practice — type &amp; check</h2>
      <p className="hint">
        She types each answer and taps Check to mark them. “New” reopens this
        sheet — saving it makes a fresh set of questions. Drag the dark bar to
        move it.
      </p>

      <div className="field">
        <label htmlFor="wsMode">Type</label>
        <select
          id="wsMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "times" | "ops")}
        >
          <option value="times">Times table</option>
          <option value="ops">Mixed questions</option>
        </select>
      </div>

      {mode === "times" && (
        <div id="wsTimes">
          <div className="field">
            <label htmlFor="wsK">Which table</label>
            <input
              id="wsK"
              type="number"
              min="1"
              max="20"
              value={k}
              onChange={(e) => setK(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="wsRows">Up to</label>
            <input
              id="wsRows"
              type="number"
              min="5"
              max="20"
              value={rows}
              onChange={(e) => setRows(e.target.value)}
            />
          </div>
        </div>
      )}

      {mode === "ops" && (
        <div id="wsOps">
          <div className="field">
            <label htmlFor="wsOp">Operation</label>
            <select id="wsOp" value={op} onChange={(e) => setOp(e.target.value)}>
              <option value="+">Addition (+)</option>
              <option value="−">Subtraction (−)</option>
              <option value="×">Multiplication (×)</option>
              <option value="÷">Division (÷)</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="wsN">How many</label>
            <input
              id="wsN"
              type="number"
              min="1"
              max="20"
              value={n}
              onChange={(e) => setN(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="wsMax">Numbers up to</label>
            <select id="wsMax" value={max} onChange={(e) => setMax(e.target.value)}>
              {[10, 12, 20, 50, 100].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="card-actions">
        <button className="btn" id="wsCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="wsAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
