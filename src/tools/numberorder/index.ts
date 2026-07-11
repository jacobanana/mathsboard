// WIDGET TOOL — a colourful number-ordering game: compare and sort numbers.
//
// Renders as an interactive React overlay (the .iorder card, see NumberOrder.tsx)
// rather than on the board canvas. A single widget runs a whole session: a set
// of ordering puzzles shown ONE round at a time. In the easy "tap one" task the
// pupil taps the biggest (or smallest) number; as it gets harder there are more
// numbers and she taps them all in order (smallest→biggest or biggest→smallest),
// correcting a mistake by tapping a tile again to remove it from the chain.
// After the last round a summary lists every puzzle and whether it was right.
//
// Like the flash cards, the puzzles are DERIVED from the params plus a `round`
// counter (never stored), and the response — the tapped chain, the current
// round — is live widget state written under INPUT_ORIGIN (synced, persisted,
// undo-invisible). The game logic lives in ./order.ts; a settings change resets
// the session via resetOnEdit.

import { defineWidgetTool } from "@/tools/registry";
import { NumberOrder } from "@/tools/numberorder/NumberOrder";
import { NumberOrderDialog } from "@/tools/numberorder/Dialog";
import {
  resetSessionPatch,
  type Level,
  type NoMode,
  type NoTarget,
  type OrderObj,
} from "@/tools/numberorder/order";

export interface NumberOrderParams {
  /** Tap ONE number (biggest/smallest) or SORT them all into an order. */
  mode: NoMode;
  /** What to find/order; "mix" randomises the goal round by round. */
  target: NoTarget;
  /** Difficulty — the number magnitude (range) in play. */
  level: Level;
  /** How many numbers per round. */
  count: number;
  /** How many rounds in the session. */
  rounds: number;
  // --- live widget state (NOT set from the dialog; via updateWidgetState) ---
  /** Monotonic "new game" counter; the session is re-derived from it. */
  round?: number;
  /** Current round index [0..rounds]; === rounds shows the summary. */
  idx?: number;
  // The tapped chains live as extra "no:<i>" fields and "nc:<i>" flags (open
  // record, see order.ts).
}

export const DEFAULT_NUMBERORDER: NumberOrderParams = {
  mode: "pick",
  target: "biggest",
  level: "easy",
  count: 3,
  rounds: 8,
};

const numberOrderTool = defineWidgetTool<NumberOrderParams>({
  kind: "widget",
  type: "numberorder",
  name: "Number order",
  blurb: "compare & sort numbers",
  category: "number",
  defaults: () => ({ ...DEFAULT_NUMBERORDER }),
  // A header strip over a play area (instruction banner + number tiles). The
  // whole layout derives from obj.w/obj.h, so it resizes cleanly (aspect-locked)
  // via the WidgetHandleLayer.
  defaultSize: { w: 340, h: 400 },
  resizable: true,
  // The tile grid reflows to fill any box, so it stretches freely on either
  // axis — no aspect lock (see WidgetTool.freeAspect).
  freeAspect: true,
  Component: NumberOrder,
  Dialog: NumberOrderDialog,
  // Editing settings always restarts the (re-derived) session from round one and
  // clears the old taps, so a config change never leaves a half-played game.
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as OrderObj),
});

export default numberOrderTool;
