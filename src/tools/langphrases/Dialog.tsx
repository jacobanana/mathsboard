// Settings dialog for the phrasebook. Pick the THEME + LEVEL (shared picker) and
// which language shows as the prompt; the languages come from the learner's
// current pair.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { languageByCode } from "@/lang/data";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
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
    base.category ?? base.set,
    base.level,
  );
  const [direction, setDirection] = useState<Direction>(base.direction);

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      category: picker.category,
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
        <div className="flash-opts">
          <button
            type="button"
            className={"flash-opt" + (direction === "known-first" ? " active" : "")}
            onClick={() => setDirection("known-first")}
          >
            {knownName} → {learningName}
          </button>
          <button
            type="button"
            className={"flash-opt" + (direction === "learning-first" ? " active" : "")}
            onClick={() => setDirection("learning-first")}
          >
            {learningName} → {knownName}
          </button>
        </div>
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
