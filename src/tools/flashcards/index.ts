// WIDGET TOOL — a colourful flash-cards game: one arithmetic card at a time.
//
// Renders as an interactive React overlay (the .iflash card, see FlashCards.tsx)
// rather than on the board canvas. A single widget runs a whole session: a deck
// of questions (times table / addition / subtraction / multiplication /
// division / mixed, across three levels) shown ONE at a time on a big flip card.
// The student types an answer and flips the card to reveal a correct / incorrect
// side with a celebration or a shake; whether right or wrong the next tap moves
// on, and after the last card a summary lists every question, answer and result.
//
// Like the Money mat and the dice, the deck is DERIVED from the params plus a
// `round` counter (never stored), and the response — the typed answers, the
// current position, the flip state — is live widget state written under
// INPUT_ORIGIN (synced, persisted, undo-invisible). The game logic lives in
// ./cards.ts; a settings change resets the session via resetOnEdit.

import { defineWidgetTool } from "@/tools/registry";
import { FlashCards } from "@/tools/flashcards/FlashCards";
import { FlashCardsDialog } from "@/tools/flashcards/Dialog";
import {
  resetSessionPatch,
  type FlashMode,
  type FlashObj,
  type Level,
} from "@/tools/flashcards/cards";

export interface FlashCardsParams {
  /** Which family of questions the deck draws from. */
  mode: FlashMode;
  /** Difficulty — controls the number ranges in play. */
  level: Level;
  /** How many cards in the deck. */
  count: number;
  /** Times mode: a fixed table (2..12), or 0 to mix tables. */
  table?: number;
  /** Optional per-card countdown, in seconds; 0 / undefined = off. */
  seconds?: number;
  // --- live widget state (NOT set from the dialog; via updateWidgetState) ---
  /** Monotonic "new deck" counter; the deck is re-derived from it. */
  round?: number;
  /** Current card index [0..count]; === count shows the summary. */
  idx?: number;
  /** Is the current card turned to its answer side? */
  flipped?: boolean;
  // The typed answers live as extra "fa:<i>" fields (open record, see cards.ts).
}

export const DEFAULT_FLASHCARDS: FlashCardsParams = {
  mode: "times",
  level: "easy",
  count: 10,
  table: 0,
};

const flashCardsTool = defineWidgetTool<FlashCardsParams>({
  kind: "widget",
  type: "flashcards",
  name: "Flash cards",
  blurb: "one card at a time",
  category: "practice",
  defaults: () => ({ ...DEFAULT_FLASHCARDS }),
  // A header strip over one big flip card. The whole layout derives from
  // obj.w/obj.h, so it resizes cleanly (aspect-locked) via the WidgetHandleLayer.
  defaultSize: { w: 340, h: 420 },
  resizable: true,
  Component: FlashCards,
  Dialog: FlashCardsDialog,
  // Editing settings always restarts the (re-derived) session from card one and
  // clears the old answers, so a config change never leaves a half-played deck.
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as FlashObj),
});

export default flashCardsTool;
