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
import { usableTopics } from "@/lang/pairs";
import { LangFlashCards } from "@/tools/langflashcards/LangFlashCards";
import { LangFlashDialog } from "@/tools/langflashcards/Dialog";
import {
  DEFAULT_COUNT,
  resetSessionPatch,
  type Direction,
  type LangFlashObj,
} from "@/tools/langflashcards/deck";

export interface LangFlashParams {
  /** The language the learner already knows (baked at creation). */
  known: string;
  /** The language being learned (baked at creation). */
  learning: string;
  /** Which vocabulary topic the deck draws from. */
  topic: string;
  /** How many cards (bounded by the topic's size). */
  count: number;
  /** Which face shows first. */
  direction: Direction;
  // --- live widget state (NOT set from the dialog; via updateWidgetState) ---
  round?: number;
  idx?: number;
  flipped?: boolean;
  // Self-ratings live as extra "fk:<i>" fields (open record, see deck.ts).
}

/** Seed a fresh deck from the learner's current pair and the first usable topic. */
export function defaultLangFlashParams(): LangFlashParams {
  const pair = currentPair();
  const topics = usableTopics(pair);
  return {
    known: pair.known,
    learning: pair.learning,
    topic: topics[0]?.id ?? "colours",
    count: DEFAULT_COUNT,
    direction: "known-first",
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
