// WIDGET TOOL — vocabulary flash cards for the language board.
//
// A study deck of word cards from a topic, shown one at a time on a big flip
// card: see a word, flip to reveal the translation, self-rate "Knew it" /
// "Practise". The languages are baked into the object at creation (from the
// learner's current pair) so a placed deck is stable and collaboration-safe even
// if the learner later switches languages — the same reason the maths widgets
// store their generated content on the object. The engine lives in ./deck.ts.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { categoriesForVocab, type LevelFilter } from "@/lang/pairs";
import { LangFlashCards } from "@/tools/langflashcards/LangFlashCards";
import { LangFlashDialog } from "@/tools/langflashcards/Dialog";
import {
  DEFAULT_COUNT,
  resetSessionPatch,
  type CustomPair,
  type Direction,
  type LangFlashObj,
} from "@/tools/langflashcards/deck";

export interface LangFlashParams {
  /** The language the learner already knows (baked at creation). */
  known: string;
  /** The language being learned (baked at creation). */
  learning: string;
  /** Which theme (category id) the deck draws from (ignored when `custom` set). */
  category: string;
  /** Difficulty filter: a level, or "mixed" for all levels. */
  level: LevelFilter;
  /** How many cards (bounded by the theme's size). */
  count: number;
  /** Which face shows first. */
  direction: Direction;
  /** Easy mode shows the picture cue on each card; off (default) = words only. */
  easy: boolean;
  /** The learner's OWN words (from the My words table) — overrides `category`. */
  custom?: CustomPair[];
  // --- live widget state (NOT set from the dialog; via updateWidgetState) ---
  round?: number;
  idx?: number;
  flipped?: boolean;
  // Self-ratings live as extra "fk:<i>" fields (open record, see deck.ts).
}

/** Seed a fresh deck from the learner's current pair and the first theme, at the
 *  Basic level (a confidence-building start). Normal (icon-free) mode is the
 *  default; easy mode is opt-in. */
export function defaultLangFlashParams(): LangFlashParams {
  const pair = currentPair();
  const categories = categoriesForVocab(pair, "mixed");
  return {
    known: pair.known,
    learning: pair.learning,
    category: categories[0]?.id ?? "colours",
    level: "basic",
    count: DEFAULT_COUNT,
    direction: "known-first",
    easy: false,
  };
}

const langFlashCardsTool = defineWidgetTool<LangFlashParams>({
  kind: "widget",
  type: "langflashcards",
  name: "Flash cards",
  blurb: "learn words one at a time",
  category: "lang-vocab",
  defaults: defaultLangFlashParams,
  defaultSize: { w: 340, h: 420 },
  resizable: true,
  Component: LangFlashCards,
  Dialog: LangFlashDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as LangFlashObj),
});

export default langFlashCardsTool;
