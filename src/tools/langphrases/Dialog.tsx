// Settings dialog for the phrasebook. Pick the THEME + LEVEL (shared picker) and
// which language shows as the prompt; the languages come from the learner's
// current pair.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { languageByCode } from "@/lang/data";
import { categoriesOf } from "@/lang/pairs";
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
    categoriesOf(base as unknown as { categories?: string[]; category?: string; set?: string }),
    base.level,
  );
  const [direction, setDirection] = useState<Direction>(base.direction);

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
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
        <label htmlFor="phDir">Show</label>
        <select
          id="phDir"
          className="lang-select"
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
        >
          <option value="known-first">
            {knownName} → {learningName}
          </option>
          <option value="learning-first">
            {learningName} → {knownName}
          </option>
        </select>
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
