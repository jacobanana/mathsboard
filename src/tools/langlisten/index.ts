// WIDGET TOOL — "Listen & choose": hear a word, tap the picture that matches.
// Languages are baked in at creation (from the learner's current pair). The
// engine lives in ./listen.ts.
//
// CONTENT-GATED: only offered when the browser can speak (the game is played by
// ear) and the loaded content has vocabulary for the pair. See `available`.

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { categoriesForVocab, type LevelFilter } from "@/lang/pairs";
import { speechSupported } from "@/lang/speech";
import { LangListen } from "@/tools/langlisten/LangListen";
import { LangListenDialog } from "@/tools/langlisten/Dialog";
import {
  DEFAULT_ROUNDS,
  resetSessionPatch,
  type ListenObj,
} from "@/tools/langlisten/listen";

export interface LangListenParams {
  known: string;
  learning: string;
  /** Themes drawn from. */
  categories: string[];
  /** Legacy single theme, kept for older boards / readers. */
  category?: string;
  level: LevelFilter;
  rounds: number;
  // --- live widget state (via updateWidgetState) ---
  round?: number;
  idx?: number;
}

export function defaultLangListenParams(): LangListenParams {
  const pair = currentPair();
  const categories = categoriesForVocab(pair, "mixed");
  const first = categories[0]?.id ?? "animals";
  return {
    known: pair.known,
    learning: pair.learning,
    categories: [first],
    category: first,
    level: "basic",
    rounds: DEFAULT_ROUNDS,
  };
}

const langListenTool = defineWidgetTool<LangListenParams>({
  kind: "widget",
  type: "langlisten",
  name: "Listen & choose",
  blurb: "hear it, tap the picture",
  category: "lang-practice",
  // Played by ear: needs speech, and some vocab to draw from.
  available: () => speechSupported() && categoriesForVocab(currentPair(), "mixed").length > 0,
  defaults: defaultLangListenParams,
  defaultSize: { w: 360, h: 380 },
  resizable: true,
  freeAspect: true,
  Component: LangListen,
  Dialog: LangListenDialog,
  resetOnEdit: (obj) => resetSessionPatch(obj as unknown as ListenObj),
});

export default langListenTool;
