// WIDGET TOOL — "Where is it?": pick the preposition that names a drawn scene.
// Languages are baked in at creation (from the learner's current pair). The
// engine lives in ./prep.ts.
//
// CONTENT-GATED: only offered in the Insert gallery when the learning language
// has enough prepositions loaded to make a round (see `available`). A pack
// without prepositions simply never shows it.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { prepositionsFor } from "@/lang/pairs";
import { LangPrep } from "@/tools/langprep/LangPrep";
import { LangPrepDialog } from "@/tools/langprep/Dialog";
import {
  DEFAULT_ROUNDS,
  MIN_ROUNDS,
  resetSessionPatch,
  type PrepObj,
} from "@/tools/langprep/prep";

export interface LangPrepParams {
  known: string;
  learning: string;
  rounds: number;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
  idx?: number;
}

export function defaultLangPrepParams(): LangPrepParams {
  const pair = currentPair();
  return {
    known: pair.known,
    learning: pair.learning,
    rounds: DEFAULT_ROUNDS,
  };
}

const langPrepTool = defineWidgetTool<LangPrepParams>({
  kind: "widget",
  type: "langprep",
  name: "Where is it?",
  blurb: "pick the preposition",
  category: "lang-practice",
  // Need at least a full round's worth (answer + distractors) to be playable.
  available: () => prepositionsFor(currentPair()).length >= MIN_ROUNDS,
  defaults: defaultLangPrepParams,
  defaultSize: { w: 360, h: 380 },
  resizable: true,
  freeAspect: true,
  Component: LangPrep,
  Dialog: LangPrepDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as PrepObj),
});

export default langPrepTool;
