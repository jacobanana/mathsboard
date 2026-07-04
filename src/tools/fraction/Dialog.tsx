// Fractions settings dialog.
//
// Reproduces fractionDialog (maths-whiteboard.html lines 477-493) exactly:
//   same labels, fields, select options, mode-switching show/hide, validation
//   messages, and the rp() parse/clamp logic. Renders only the card body; the
//   host owns the #scrim / .card wrapper.
//
// Conventions (per registry.ts ToolDialogProps):
//   initial present -> EDIT -> buttons "Cancel"/"Save".
//   initial absent  -> CREATE -> buttons "Back"/"Add to board".

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { FractionBar, FractionParams } from "@/tools/fraction";

export function FractionDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<FractionParams>) {
  const ex = initial;
  const editing = ex != null;

  // Seed field state exactly like the prototype's local var setup.
  const b1: FractionBar = ex && ex.bars ? ex.bars[0] : { parts: 4, shaded: 1 };
  const b2: FractionBar =
    ex && ex.bars && ex.bars[1] ? ex.bars[1] : { parts: 8, shaded: 2 };
  const hasB2 = !!(ex && ex.bars && ex.bars[1]);
  const cp = ex && ex.parts ? ex.parts : 4;
  const cs = ex && ex.shaded != null ? ex.shaded : 1;

  const [mode, setMode] = useState<FractionParams["mode"]>(
    ex ? ex.mode : "bars",
  );
  const [f1p, setF1p] = useState(String(b1.parts));
  const [f1s, setF1s] = useState(String(b1.shaded));
  const [f2on, setF2on] = useState(hasB2);
  const [f2p, setF2p] = useState(String(b2.parts));
  const [f2s, setF2s] = useState(String(b2.shaded));
  const [fcP, setFcP] = useState(String(cp));
  const [fcS, setFcS] = useState(String(cs));
  const [err, setErr] = useState("");

  // rp(): parse a parts/shaded pair, clamp exactly as the prototype.
  function rp(pStr: string, sStr: string): FractionBar | null {
    const parts = parseInt(pStr, 10);
    let shaded = parseInt(sStr, 10);
    if (isNaN(parts) || parts < 1 || parts > 12) return null;
    if (isNaN(shaded) || shaded < 0) shaded = 0;
    if (shaded > parts) shaded = parts;
    return { parts, shaded };
  }

  function submit() {
    if (mode === "bars") {
      const x1 = rp(f1p, f1s);
      if (!x1) {
        setErr("Bar 1 needs 1–12 parts.");
        return;
      }
      const bars: FractionBar[] = [x1];
      if (f2on) {
        const x2 = rp(f2p, f2s);
        if (!x2) {
          setErr("Bar 2 needs 1–12 parts.");
          return;
        }
        bars.push(x2);
      }
      onSubmit({ mode: "bars", bars });
    } else {
      const c = rp(fcP, fcS);
      if (!c) {
        setErr("Use 1–12 parts.");
        return;
      }
      onSubmit({ mode: "circle", parts: c.parts, shaded: c.shaded });
    }
  }

  return (
    <>
      <h2>Fractions</h2>
      <p className="hint">Three ways to show a fraction — pick what fits.</p>

      <div className="field">
        <label htmlFor="frMode">Show as</label>
        <select
          id="frMode"
          value={mode}
          onChange={(e) =>
            setMode(e.target.value as FractionParams["mode"])
          }
        >
          <option value="bars">Bars (compare two)</option>
          <option value="circle">Circle (pie)</option>
        </select>
      </div>

      <div id="frBars" style={{ display: mode === "bars" ? "block" : "none" }}>
        <div className="subhead">Bar 1</div>
        <div className="field">
          <label htmlFor="f1s">Parts shaded</label>
          <input
            id="f1s"
            type="number"
            min="0"
            max="12"
            value={f1s}
            onChange={(e) => setF1s(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="f1p">Number of parts</label>
          <input
            id="f1p"
            type="number"
            min="1"
            max="12"
            value={f1p}
            onChange={(e) => setF1p(e.target.value)}
          />
        </div>
        <label className="field check">
          <input
            id="f2on"
            type="checkbox"
            checked={f2on}
            onChange={(e) => setF2on(e.target.checked)}
          />
          <span>Add a second bar to compare</span>
        </label>
        <div id="f2box" style={{ display: f2on ? "block" : "none" }}>
          <div className="subhead">Bar 2</div>
          <div className="field">
            <label htmlFor="f2s">Parts shaded</label>
            <input
              id="f2s"
              type="number"
              min="0"
              max="12"
              value={f2s}
              onChange={(e) => setF2s(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f2p">Number of parts</label>
            <input
              id="f2p"
              type="number"
              min="1"
              max="12"
              value={f2p}
              onChange={(e) => setF2p(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div
        id="frCircle"
        style={{ display: mode === "circle" ? "block" : "none" }}
      >
        <div className="field">
          <label htmlFor="fcS">Parts shaded</label>
          <input
            id="fcS"
            type="number"
            min="0"
            max="12"
            value={fcS}
            onChange={(e) => setFcS(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="fcP">Number of parts</label>
          <input
            id="fcP"
            type="number"
            min="1"
            max="12"
            value={fcP}
            onChange={(e) => setFcP(e.target.value)}
          />
        </div>
      </div>

      <p className="err" id="frErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="frCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="frAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
