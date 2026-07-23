// Settings dialog for the phrasebook. Pick the THEME + LEVEL (shared picker) and
// which language shows as the prompt; the languages come from the learner's
// current pair.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { DirectionSwap, pairSides } from "@/lang/DirectionSwap";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import { categoriesFromObj } from "@/lang/pairs";
import type { Direction } from "@/tools/langflashcards/deck";
import {
  defaultLangPhrasesParams,
  type LangPhrasesParams,
} from "@/tools/langphrases";

export function LangPhrasesDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangPhrasesParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangPhrasesParams();
  const pair = { known: base.known, learning: base.learning };

  const picker = useContentPicker(
    "sentences",
    pair,
    categoriesFromObj(base),
    base.level,
  );
  const [direction, setDirection] = useState<Direction>(base.direction);
  const sides = pairSides(pair);
  const knownFirst = direction === "known-first";

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
      category: picker.selected[0],
      level: picker.level,
      direction,
    });
  }

  return (
    <>
      <h2>Sentences</h2>
      <p className="hint">
        A little phrasebook. Tap a sentence to reveal its translation.
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label>Show</label>
        <DirectionSwap
          leftRole="Prompt"
          rightRole="Reveal"
          left={knownFirst ? sides.known : sides.learning}
          right={knownFirst ? sides.learning : sides.known}
          onSwap={() => setDirection(knownFirst ? "learning-first" : "known-first")}
          swapTitle="Swap which language is the prompt"
        />
      </div>

      <div className="card-actions">
        <button className="btn" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
