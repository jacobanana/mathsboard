// WIDGET TOOL — "Le or la?": sort each noun into its gender basket. Languages
// are baked in at creation (from the learner's current pair). The engine lives
// in ./gender.ts.
//
// CONTENT-GATED: only offered in the Insert gallery when the learning language
// has at least two distinct articles in the loaded content (French le/la,
// German der/die/das …) — so an English board never shows it. See `available`.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { articlesForLearning, categoriesForArticleNouns } from "@/lang/pairs";
import { LangGender } from "@/tools/langgender/LangGender";
import { LangGenderDialog } from "@/tools/langgender/Dialog";
import {
  DEFAULT_COUNT,
  MIN_COUNT,
  resetSessionPatch,
  type GenderObj,
} from "@/tools/langgender/gender";

export interface LangGenderParams {
  known: string;
  learning: string;
  /** Themes drawn from. */
  categories: string[];
  /** Legacy single theme, kept for older boards / readers. */
  category?: string;
  /** Difficulty filter: a level, or "mixed". */
  level: "basic" | "medium" | "advanced" | "mixed";
  count: number;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
}

export function defaultLangGenderParams(): LangGenderParams {
  const pair = currentPair();
  const categories = categoriesForArticleNouns(pair, "mixed", MIN_COUNT);
  const first = categories[0]?.id ?? "animals";
  return {
    known: pair.known,
    learning: pair.learning,
    categories: [first],
    category: first,
    level: "mixed",
    count: DEFAULT_COUNT,
  };
}

const langGenderTool = defineWidgetTool<LangGenderParams>({
  kind: "widget",
  type: "langgender",
  name: "Le or la?",
  blurb: "sort words by gender",
  category: "lang-practice",
  // Only worth offering when the learning language marks gender with 2+ articles.
  available: () => articlesForLearning(currentPair()).length >= 2,
  defaults: defaultLangGenderParams,
  defaultSize: { w: 380, h: 400 },
  resizable: true,
  freeAspect: true,
  Component: LangGender,
  Dialog: LangGenderDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as GenderObj),
});

export default langGenderTool;
