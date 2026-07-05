// WIDGET TOOL — a realistic 3D die you roll with a click.
//
// Renders as an interactive React overlay (the .idice card, see Dice.tsx), not
// on the board canvas. The die's SETTINGS (how many faces, what colour) are
// ordinary params set from the Dialog; the die's STATE (the settled `value` and
// a `roll` counter that drives the tumble) is live widget state written under
// INPUT_ORIGIN, so it syncs to collaborators, persists across reloads, and is
// undo-invisible — the same model as the worksheet's typed answers. Neither
// `value` nor `roll` is a param, so editing settings never disturbs the roll,
// and each die on the board is an independent object rolling on its own.
//
// The die geometry (the standard d6/d8/d10/d12/d20 polyhedra) and the tumble
// maths live in ./geometry.ts; the canvas painter and interaction in ./Dice.tsx.

import { defineWidgetTool } from "@/tools/registry";
import { Dice } from "@/tools/dice/Dice";
import { DiceDialog } from "@/tools/dice/Dialog";
import type { FaceCount } from "@/tools/dice/geometry";

export interface DiceParams {
  /** Number of faces — the die type (d6, d8, d10, d12, d20). */
  faces: FaceCount;
  /** Die body colour (hex). Numbers/pips auto-contrast. */
  color: string;
  // Live widget state (NOT set from the dialog; written via updateWidgetState):
  /** The face currently showing (1..faces). Absent until first rolled. */
  value?: number;
  /** Monotonic roll counter; a change triggers the tumble on every client. */
  roll?: number;
}

/** Default die colour (classic casino red — white pips auto-contrast on it). */
export const DEFAULT_DICE_COLOR = "#D64545";

/** Colour choices in the dialog. Off-white / lifted-black so both read on the
 *  light squared paper. */
export const DICE_COLORS: [string, string][] = [
  ["red", "#D64545"],
  ["orange", "#E8842B"],
  ["yellow", "#EBC017"],
  ["green", "#2E9E5B"],
  ["teal", "#16A6A0"],
  ["blue", "#2E6FB7"],
  ["purple", "#7E57C2"],
  ["pink", "#D6469B"],
  ["white", "#F5F3EC"],
  ["black", "#2A2E30"],
];

const diceTool = defineWidgetTool<DiceParams>({
  kind: "widget",
  type: "dice",
  name: "Dice",
  blurb: "roll a real 3D die",
  category: "number",
  defaults: () => ({ faces: 6, color: DEFAULT_DICE_COLOR }),
  // Square die area (150) plus the caption strip under it (see Dice CAPTION_H).
  defaultSize: { w: 150, h: 176 },
  Component: Dice,
  Dialog: DiceDialog,
});

export default diceTool;
