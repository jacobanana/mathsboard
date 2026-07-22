// WIDGET TOOL — the sentence builder: put the words in order.
//
// A session of "rebuild the sentence" puzzles from a sentence set: each round
// shows a sentence in the known language and the scrambled words of its
// translation to tap into order. Languages are baked in at creation (from the
// learner's current pair). The engine lives in ./builder.ts.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { usableSentenceSets } from "@/lang/pairs";
import { LangSentence } from "@/tools/langsentence/LangSentence";
import { LangSentenceDialog } from "@/tools/langsentence/Dialog";
import {
  DEFAULT_ROUNDS,
  resetSessionPatch,
  type SentenceObj,
} from "@/tools/langsentence/builder";

export interface LangSentenceParams {
  known: string;
  learning: string;
  set: string;
  rounds: number;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
  idx?: number;
}

export function defaultLangSentenceParams(): LangSentenceParams {
  const pair = currentPair();
  const sets = usableSentenceSets(pair);
  return {
    known: pair.known,
    learning: pair.learning,
    set: sets[0]?.id ?? "everyday",
    rounds: DEFAULT_ROUNDS,
  };
}

const langSentenceTool = defineWidgetTool<LangSentenceParams>({
  kind: "widget",
  type: "langsentence",
  name: "Sentence builder",
  blurb: "put the words in order",
  category: "lang-practice",
  defaults: defaultLangSentenceParams,
  defaultSize: { w: 360, h: 420 },
  resizable: true,
  // The word bank reflows to fill any box, so it stretches freely on both axes.
  freeAspect: true,
  Component: LangSentence,
  Dialog: LangSentenceDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as SentenceObj),
});

export default langSentenceTool;
