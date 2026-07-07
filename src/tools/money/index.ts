// WIDGET TOOL — a 3D money mat for learning to count coins and notes.
//
// Renders as an interactive React overlay (the .imoney card, see Money.tsx), not
// on the board canvas. One widget hosts six games (count, give change, make an
// amount, shop, compare, free-play sandbox) across four currencies (USD, GBP,
// EUR, CHF). The game / currency / difficulty are ordinary params set from the
// Dialog; the current problem is DERIVED from them plus a `round` counter (never
// stored), and the student's response — a typed `ans`, a compare `choice`, or a
// pile of placed pieces keyed pc:<id> — is live widget state written under
// INPUT_ORIGIN (synced, persisted, undo-invisible), the same model as the dice
// roll and the worksheet's answers.
//
// The currency table + money maths live in ./currencies.ts, the game engine in
// ./games.ts, the coin/note meshes in ./geometry.ts, and the canvas painter in
// ./render.ts.

import { defineWidgetTool } from "@/tools/registry";
import { Money } from "@/tools/money/Money";
import { MoneyDialog } from "@/tools/money/Dialog";
import type { CurrencyCode, Difficulty } from "@/tools/money/currencies";
import type { MoneyGame, Relation } from "@/tools/money/games";

export interface MoneyParams {
  /** Which currency's coins and notes to use. */
  currency: CurrencyCode;
  /** Which game the card is playing. */
  game: MoneyGame;
  /** Difficulty — controls the denominations in play and the amount range. */
  difficulty: Difficulty;
  /** Auto-advance: on a correct check, celebrate then load a new question. */
  autoNew?: boolean;
  // --- live widget state (NOT set from the dialog; via updateWidgetState) ---
  /** Monotonic "new problem" counter; the problem is re-derived from it. */
  round?: number;
  /** The typed amount (count / change). */
  ans?: string;
  /** The compare-piles selection. */
  choice?: Relation;
  /** Set on Check; cleared when the answer / pile changes. */
  result?: "ok" | "no";
  /** The config stamp the pile belongs to; a mismatch reseeds (see Money.tsx). */
  stamp?: string;
  // Placed pieces live as extra "pc:<id>" fields (open record, see games.ts).
}

export const DEFAULT_MONEY: MoneyParams = {
  currency: "USD",
  game: "count",
  difficulty: "easy",
};

const moneyTool = defineWidgetTool<MoneyParams>({
  kind: "widget",
  type: "money",
  name: "Money",
  blurb: "count coins & notes",
  category: "number",
  defaults: () => ({ ...DEFAULT_MONEY }),
  // Prompt row + mat + answer row + tray. The card derives its whole layout from
  // obj.w/obj.h, so it resizes cleanly (aspect-locked) via the WidgetHandleLayer.
  // Wide enough that the tray shows every denomination in ≤2 rows (see trayRows).
  defaultSize: { w: 520, h: 440 },
  resizable: true,
  Component: Money,
  Dialog: MoneyDialog,
});

export default moneyTool;
