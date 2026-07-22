// WIDGET TOOL — the phrasebook: basic sentences to learn, tap to reveal the
// translation. Languages are baked in at creation (from the learner's current
// pair). A study aid, so there is no scoring.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { usableSentenceSets } from "@/lang/pairs";
import { LangPhrases } from "@/tools/langphrases/LangPhrases";
import { LangPhrasesDialog } from "@/tools/langphrases/Dialog";
import type { Direction } from "@/tools/langflashcards/deck";

export interface LangPhrasesParams {
  known: string;
  learning: string;
  set: string;
  /** Which language is shown as the prompt (the other is the hidden answer). */
  direction: Direction;
  // Revealed rows live as extra "pr:<i>" fields (via updateWidgetState).
}

export function defaultLangPhrasesParams(): LangPhrasesParams {
  const pair = currentPair();
  const sets = usableSentenceSets(pair);
  return {
    known: pair.known,
    learning: pair.learning,
    set: sets[0]?.id ?? "everyday",
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
