// WIDGET TOOL — the vocabulary notepad: a little book of words to browse and
// hear. Each PAGE is one theme; the learner turns pages to move between themes,
// reads every word the theme offers, and taps a word to hear it spoken. Unlike
// the flash cards it never quizzes or scores — it's a reference/listening aid,
// the vocabulary equivalent of the phrasebook (langphrases).
//
// Like every language widget the pair is baked in at creation (from the
// learner's current pair) so a placed notepad is stable and collaboration-safe
// even if the learner later switches languages. Content is resolved live from
// lang/pairs, so importing a content pack fills the pages with no widget change.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { categoriesForVocab, type LevelFilter } from "@/lang/pairs";
import { LangVocab } from "@/tools/langvocab/LangVocab";
import { LangVocabDialog } from "@/tools/langvocab/Dialog";
import type { Direction } from "@/tools/langflashcards/deck";

export interface LangVocabParams {
  /** The language the learner already knows (baked at creation). */
  known: string;
  /** The language being learned (baked at creation). */
  learning: string;
  /** Which themes to leaf through — one PAGE each. */
  categories: string[];
  /** Legacy single theme, kept for older boards / readers. */
  category?: string;
  /** Difficulty filter: a level, or "mixed" for all levels. */
  level: LevelFilter;
  /** Which language is the headword (the big, primary word on each row). */
  direction: Direction;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Which page (theme) is open. */
  page?: number;
}

/** Seed a notepad from the learner's current pair, opening on the first few
 *  themes (so there are pages to turn) with the learning word as the headword. */
export function defaultLangVocabParams(): LangVocabParams {
  const pair = currentPair();
  const categories = categoriesForVocab(pair, "mixed");
  const first = categories.slice(0, 3).map((c) => c.id);
  const chosen = first.length ? first : categories[0] ? [categories[0].id] : ["colours"];
  return {
    known: pair.known,
    learning: pair.learning,
    categories: chosen,
    category: chosen[0],
    level: "mixed",
    direction: "learning-first",
    page: 0,
  };
}

const langVocabTool = defineWidgetTool<LangVocabParams>({
  kind: "widget",
  type: "langvocab",
  name: "Word list",
  blurb: "a notepad of words to browse & hear",
  category: "lang-vocab",
  defaults: defaultLangVocabParams,
  defaultSize: { w: 360, h: 460 },
  resizable: true,
  freeAspect: true,
  Component: LangVocab,
  Dialog: LangVocabDialog,
  // Turning the theme set on edit could leave the open page out of range —
  // snap back to the first page whenever the settings change.
  resetOnEdit: () => ({ page: 0 }),
});

export default langVocabTool;
