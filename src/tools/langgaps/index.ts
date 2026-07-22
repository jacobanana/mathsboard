// WIDGET TOOL — Fill the gaps: complete the missing word in a sentence. Uses the
// SAME sentence database as the other sentence games; easy mode offers word
// choices, hard mode asks you to type. The engine lives in ./gaps.ts.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { categoriesForSentences, type LevelFilter } from "@/lang/pairs";
import { LangGaps } from "@/tools/langgaps/LangGaps";
import { LangGapsDialog } from "@/tools/langgaps/Dialog";
import {
  DEFAULT_ROUNDS,
  resetSessionPatch,
  type Difficulty,
  type GapObj,
} from "@/tools/langgaps/gaps";

export interface LangGapsParams {
  known: string;
  learning: string;
  /** Themes drawn from. */
  categories: string[];
  /** Legacy single theme, kept for older boards / readers. */
  category?: string;
  level: LevelFilter;
  /** Easy = pick from words; hard = type the word. */
  difficulty: Difficulty;
  rounds: number;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
  idx?: number;
}

export function defaultLangGapsParams(): LangGapsParams {
  const pair = currentPair();
  const categories = categoriesForSentences(pair, "mixed");
  const first = categories[0]?.id ?? "greetings";
  return {
    known: pair.known,
    learning: pair.learning,
    categories: [first],
    category: first,
    level: "basic",
    difficulty: "pick",
    rounds: DEFAULT_ROUNDS,
  };
}

const langGapsTool = defineWidgetTool<LangGapsParams>({
  kind: "widget",
  type: "langgaps",
  name: "Fill the gaps",
  blurb: "complete the sentence",
  category: "lang-practice",
  defaults: defaultLangGapsParams,
  defaultSize: { w: 380, h: 340 },
  resizable: true,
  freeAspect: true,
  Component: LangGaps,
  Dialog: LangGapsDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as GapObj),
});

export default langGapsTool;
