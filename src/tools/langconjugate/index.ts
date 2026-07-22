// WIDGET TOOL — the conjugation game: learn to conjugate a verb in a tense.
// Pick a verb + tense + how to practise (learn / pick / type). Engine: ./conj.ts.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { verbsFor } from "@/lang/conjugation";
import { LangConjugate } from "@/tools/langconjugate/LangConjugate";
import { LangConjugateDialog } from "@/tools/langconjugate/Dialog";
import { resetSessionPatch, type ConjMode, type ConjObj } from "@/tools/langconjugate/conj";

export interface LangConjugateParams {
  known: string;
  learning: string;
  verb: string;
  tense: string;
  mode: ConjMode;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
}

export function defaultLangConjugateParams(): LangConjugateParams {
  const pair = currentPair();
  const verbs = verbsFor(pair.learning, "mixed");
  return {
    known: pair.known,
    learning: pair.learning,
    verb: verbs[0]?.id ?? "etre",
    tense: "present",
    mode: "learn",
  };
}

const langConjugateTool = defineWidgetTool<LangConjugateParams>({
  kind: "widget",
  type: "langconjugate",
  name: "Conjugation",
  blurb: "learn to conjugate a verb",
  category: "lang-practice",
  defaults: defaultLangConjugateParams,
  defaultSize: { w: 340, h: 400 },
  resizable: true,
  freeAspect: true,
  Component: LangConjugate,
  Dialog: LangConjugateDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as ConjObj),
});

export default langConjugateTool;
