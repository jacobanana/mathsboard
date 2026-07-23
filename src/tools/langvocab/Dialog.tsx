// Settings dialog for the vocabulary notepad. Languages are fixed to the
// learner's current pair (shown read-only via the direction control); the
// learner picks the THEMES (one page each) + LEVEL (shared CategoryLevelPicker)
// and which language is the headword. The tool restarts on the first page on
// save (resetOnEdit), so changing themes never leaves it on a missing page.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { DirectionSwap, pairSides } from "@/lang/DirectionSwap";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import { categoriesFromObj } from "@/lang/pairs";
import type { Direction } from "@/tools/langflashcards/deck";
import {
  defaultLangVocabParams,
  type LangVocabParams,
} from "@/tools/langvocab";

export function LangVocabDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangVocabParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangVocabParams();
  const pair = { known: base.known, learning: base.learning };

  const picker = useContentPicker(
    "vocab",
    pair,
    categoriesFromObj(base),
    base.level,
  );
  const [direction, setDirection] = useState<Direction>(base.direction);
  const sides = pairSides(pair);
  const headIsLearning = direction !== "known-first";

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
      category: picker.selected[0],
      level: picker.level,
      direction,
      page: 0,
    });
  }

  return (
    <>
      <h2>Word list</h2>
      <p className="hint">
        A little notepad of words. Turn the pages through each theme, tap a word
        to hear it, or hide the answers to test yourself.
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label>Headword</label>
        <DirectionSwap
          leftRole="Word"
          rightRole="Meaning"
          left={headIsLearning ? sides.learning : sides.known}
          right={headIsLearning ? sides.known : sides.learning}
          onSwap={() => setDirection(headIsLearning ? "known-first" : "learning-first")}
          swapTitle="Swap which language is the headword"
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
