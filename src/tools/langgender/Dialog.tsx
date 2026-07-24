// Settings dialog for "le or la?". Pick the THEME(S) + LEVEL (shared picker,
// scoped to gendered nouns) and how many words; the languages come from the
// learner's current pair (read-only).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import { categoriesFromObj } from "@/lang/pairs";
import {
  MAX_COUNT,
  MIN_COUNT,
  levelOf,
  type GenderObj,
} from "@/tools/langgender/gender";
import { defaultLangGenderParams, type LangGenderParams } from "@/tools/langgender";

export function LangGenderDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangGenderParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangGenderParams();
  const pair = { known: base.known, learning: base.learning };

  const picker = useContentPicker(
    "gender",
    pair,
    categoriesFromObj(base as unknown as GenderObj),
    levelOf(base as unknown as GenderObj),
    MIN_COUNT,
  );
  const [count, setCount] = useState<string>(String(base.count));

  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
      category: picker.selected[0],
      level: picker.level,
      count: clamp(parseInt(count, 10) || base.count, MIN_COUNT, MAX_COUNT),
    });
  }

  return (
    <>
      <h2>Le or la?</h2>
      <p className="hint">
        Sort each <b>{learningName}</b> word into the right basket by its article.
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label htmlFor="gdCount">How many words</label>
        <input
          id="gdCount"
          type="number"
          min={MIN_COUNT}
          max={MAX_COUNT}
          value={count}
          onChange={(e) => setCount(e.target.value)}
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
