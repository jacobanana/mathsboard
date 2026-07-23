// WIDGET TOOL — the phrasebook: basic sentences to browse and hear, one page
// per theme (leaf through with the footer nav, tap a sentence to listen, or
// hide the answers to test yourself). Shares its body with the Word list — see
// src/lang/StudyNotepad. Languages are baked in at creation (from the learner's
// current pair). A study aid, so there is no scoring.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { categoriesForSentences, type LevelFilter } from "@/lang/pairs";
import { LangPhrases } from "@/tools/langphrases/LangPhrases";
import { LangPhrasesDialog } from "@/tools/langphrases/Dialog";
import type { Direction } from "@/tools/langflashcards/deck";

export interface LangPhrasesParams {
  known: string;
  learning: string;
  /** Themes drawn from. Older objects carry a single `category`, the earliest a `set`. */
  categories?: string[];
  category?: string;
  set?: string;
  /** Difficulty filter: a level, or "mixed". */
  level?: LevelFilter;
  /** Which language leads each row (the other is its translation, shown below). */
  direction: Direction;
  // --- live widget state (via updateWidgetState) ---
  /** The open theme page. */
  page?: number;
}

export function defaultLangPhrasesParams(): LangPhrasesParams {
  const pair = currentPair();
  const categories = categoriesForSentences(pair, "mixed");
  const first = categories[0]?.id ?? "greetings";
  return {
    known: pair.known,
    learning: pair.learning,
    categories: [first],
    category: first,
    level: "mixed",
    direction: "known-first",
  };
}

const langPhrasesTool = defineWidgetTool<LangPhrasesParams>({
  kind: "widget",
  type: "langphrases",
  name: "Sentences",
  blurb: "basic sentences to learn",
  category: "lang-vocab",
  defaults: defaultLangPhrasesParams,
  defaultSize: { w: 360, h: 320 },
  resizable: true,
  freeAspect: true,
  Component: LangPhrases,
  Dialog: LangPhrasesDialog,
});

export default langPhrasesTool;
