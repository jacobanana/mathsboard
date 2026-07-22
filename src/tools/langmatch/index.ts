// WIDGET TOOL — match the translation: draw a line from each word to its
// translation. Languages are baked in at creation (from the learner's current
// pair). The engine lives in ./match.ts.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { categoriesForVocab, type LevelFilter } from "@/lang/pairs";
import { LangMatch } from "@/tools/langmatch/LangMatch";
import { LangMatchDialog } from "@/tools/langmatch/Dialog";
import {
  DEFAULT_COUNT,
  MIN_COUNT,
  resetSessionPatch,
  type MatchObj,
} from "@/tools/langmatch/match";

export interface LangMatchParams {
  known: string;
  learning: string;
  /** Themes (category ids). */
  categories: string[];
  /** Difficulty filter: a level, or "mixed". */
  level: LevelFilter;
  count: number;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
}

export function defaultLangMatchParams(): LangMatchParams {
  const pair = currentPair();
  const categories = categoriesForVocab(pair, "mixed", MIN_COUNT);
  return {
    known: pair.known,
    learning: pair.learning,
    categories: [categories[0]?.id ?? "colours"],
    level: "basic",
    count: DEFAULT_COUNT,
  };
}

const langMatchTool = defineWidgetTool<LangMatchParams>({
  kind: "widget",
  type: "langmatch",
  name: "Match up",
  blurb: "join words to translations",
  category: "lang-practice",
  defaults: defaultLangMatchParams,
  defaultSize: { w: 380, h: 360 },
  resizable: true,
  // The two columns reflow to fill any box, so it stretches freely.
  freeAspect: true,
  Component: LangMatch,
  Dialog: LangMatchDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as MatchObj),
});

export default langMatchTool;
