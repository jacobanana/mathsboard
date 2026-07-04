// Dialog for the protractor / angle-facts tool.
//
// Conventions (see numberline/Dialog.tsx):
//   - Props are ToolDialogProps<P>: { initial?, onSubmit, onCancel }.
//   - Renders ONLY the card body; the host renders the #scrim / .card wrapper.
//   - EDIT vs CREATE decided by `initial`:
//       present -> editing  -> buttons "Cancel" / "Save".
//       absent  -> creating -> buttons "Back"   / "Add to board".
//   - Validate on submit; on failure set .err text and DO NOT call onSubmit.
//
// Ported faithfully from protractorDialog (maths-whiteboard.html lines 522-530).
// The two sub-groups (#prProt / #prFacts) are shown/hidden by the Type select,
// exactly as the prototype's upd() did.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import type { ProtractorParams } from "@/tools/protractor";

export function ProtractorDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<ProtractorParams>) {
  const editing = initial != null;

  // Seed fields exactly like the prototype's defaulting (lines 522).
  const [mode, setMode] = useState<"protractor" | "facts">(
    initial ? initial.mode : "protractor",
  );
  const [angle, setAngle] = useState(
    String(initial && initial.angle != null ? initial.angle : 40),
  );
  const [showArms, setShowArms] = useState(
    initial ? initial.showArms !== false : true,
  );
  const [fact, setFact] = useState<"line" | "point" | "triangle">(
    initial && initial.fact ? initial.fact : "line",
  );
  const [given, setGiven] = useState(
    initial && initial.givenRaw ? initial.givenRaw : "65, 30",
  );
  const [err, setErr] = useState("");

  function submit() {
    if (mode === "protractor") {
      onSubmit({
        mode: "protractor",
        angle: clamp(parseInt(angle, 10) || 0, 0, 180),
        showArms,
        // facts fields carried through with defaults (not used in this mode).
        fact,
        given: initial ? initial.given : [65, 30],
        givenRaw: given,
      });
    } else {
      const raw = given;
      const parsed = raw
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => !isNaN(n));
      const total = fact === "point" ? 360 : 180;
      if (fact === "triangle" && parsed.length !== 2) {
        setErr("Enter the two known angles.");
        return;
      }
      if (!parsed.length) {
        setErr("Enter at least one known angle.");
        return;
      }
      const sum = parsed.reduce((s, a) => s + a, 0);
      if (sum >= total) {
        setErr("Known angles must total under " + total + "°.");
        return;
      }
      onSubmit({
        mode: "facts",
        fact,
        given: parsed,
        givenRaw: raw,
        // protractor fields carried through with defaults (not used here).
        angle: clamp(parseInt(angle, 10) || 0, 0, 180),
        showArms,
      });
    }
  }

  return (
    <>
      <h2>Protractor &amp; angles</h2>
      <p className="hint">
        A protractor to read an angle, or an angle-facts diagram with a missing
        angle (x).
      </p>

      <div className="field">
        <label htmlFor="prMode">Type</label>
        <select
          id="prMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "protractor" | "facts")}
        >
          <option value="protractor">Protractor</option>
          <option value="facts">Angle facts (missing angle)</option>
        </select>
      </div>

      <div id="prProt" style={{ display: mode === "protractor" ? "block" : "none" }}>
        <div className="field">
          <label htmlFor="prAngle">Angle to show (0–180)</label>
          <input
            id="prAngle"
            type="number"
            min={0}
            max={180}
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
          />
        </div>
        <label className="field check">
          <input
            id="prArms"
            type="checkbox"
            checked={showArms}
            onChange={(e) => setShowArms(e.target.checked)}
          />
          <span>Draw the angle arms</span>
        </label>
      </div>

      <div id="prFacts" style={{ display: mode === "facts" ? "block" : "none" }}>
        <div className="field">
          <label htmlFor="prFact">Fact</label>
          <select
            id="prFact"
            value={fact}
            onChange={(e) =>
              setFact(e.target.value as "line" | "point" | "triangle")
            }
          >
            <option value="line">On a straight line (180°)</option>
            <option value="point">Around a point (360°)</option>
            <option value="triangle">In a triangle (180°)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="prGiven">Known angles</label>
          <input
            id="prGiven"
            type="text"
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            placeholder="e.g. 65, 30"
            style={{ width: 170, textAlign: "left" }}
          />
        </div>
      </div>

      <p className="err" id="prErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="prCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="prAdd" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
