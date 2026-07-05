// Settings dialog for the Dice tool.
//
// Conventions (see src/tools/numberline/Dialog.tsx): props are
// ToolDialogProps<DiceParams>; the dialog renders only the card body; EDIT vs
// CREATE is decided by `initial` (Save/Cancel vs Add to board/Back).
//
// Two settings only — the die type (face count) and its colour. The rolled
// value and roll counter are live widget state, never edited here, so they're
// untouched by a settings change.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { DICE_COLORS, DEFAULT_DICE_COLOR, type DiceParams } from "@/tools/dice";
import {
  DICE_FACES,
  dieLabel,
  isFaceCount,
  type FaceCount,
} from "@/tools/dice/geometry";

export function DiceDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<DiceParams>) {
  const editing = initial != null;

  const [faces, setFaces] = useState<FaceCount>(
    initial && isFaceCount(initial.faces) ? initial.faces : 6,
  );
  const [color, setColor] = useState(initial?.color ?? DEFAULT_DICE_COLOR);

  function submit() {
    onSubmit({ faces, color });
  }

  return (
    <>
      <h2>Dice</h2>
      <p className="hint">
        Pick a die and colour, then click it on the board to roll. The result is
        shared with everyone and stays put until the next roll.
      </p>

      <div className="field">
        <label>Number of sides</label>
        <div className="dice-faces">
          {DICE_FACES.map((n) => (
            <button
              key={n}
              type="button"
              className={"dice-face-btn" + (faces === n ? " active" : "")}
              onClick={() => setFaces(n)}
            >
              {dieLabel(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Colour</label>
        <div className="swatch-row">
          {DICE_COLORS.map(([label, hex]) => (
            <button
              key={hex}
              type="button"
              className={"swatch" + (color === hex ? " active" : "")}
              style={{ background: hex }}
              title={label}
              onClick={() => setColor(hex)}
            />
          ))}
        </div>
      </div>

      <div className="card-actions">
        <button className="btn" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
