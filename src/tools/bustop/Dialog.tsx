// Dialog for the bus-stop division tool.
//
// Ported from busStopDialog (maths-whiteboard.html lines 460-468) and the
// shared fillRow helper (line 389). Same labels, fields, fill row, validation
// message and create/edit button labels as the prototype.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { BusStopParams } from "@/tools/bustop";

export function BusStopDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<BusStopParams>) {
  const editing = initial != null;

  const [dd, setDd] = useState(String(initial ? initial.dividend : 156));
  const [dv, setDv] = useState(String(initial ? initial.divisor : 4));
  const [long, setLong] = useState(initial ? !!initial.long : false);
  const [err, setErr] = useState("");

  function submit() {
    const d = parseInt(dd, 10);
    const v = parseInt(dv, 10);
    if (isNaN(d) || isNaN(v) || v < 1 || d < 0) {
      setErr("Enter the number to divide and a divisor of 1 or more.");
      return;
    }
    onSubmit({ dividend: d, divisor: v, long });
  }

  return (
    <>
      <h2>Division — bus-stop</h2>
      <p className="hint">
        Short-division frame. Fill it for a worked example with carries and
        remainder.
      </p>

      <div className="field">
        <label htmlFor="bsDd">Number to divide</label>
        <input
          id="bsDd"
          type="number"
          min="0"
          value={dd}
          onChange={(e) => setDd(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bsDv">Divide by</label>
        <input
          id="bsDv"
          type="number"
          min="1"
          value={dv}
          onChange={(e) => setDv(e.target.value)}
        />
      </div>
      <label className="field check">
        <input
          id="bsLong"
          type="checkbox"
          checked={long}
          onChange={(e) => setLong(e.target.checked)}
        />
        <span>Extra space for long division</span>
      </label>

      <p className="err" id="bsErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="bsCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="bsAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
