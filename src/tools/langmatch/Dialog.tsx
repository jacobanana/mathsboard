// Settings dialog for Match up. Pick the THEME + LEVEL (shared picker) and how
// many pairs; the languages come from the learner's current pair (read-only).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import {
  MAX_COUNT,
  MIN_COUNT,
  categoriesOf,
  levelOf,
  type MatchObj,
} from "@/tools/langmatch/match";
import { defaultLangMatchParams, type LangMatchParams } from "@/tools/langmatch";

export function LangMatchDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangMatchParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangMatchParams();
  const pair = { known: base.known, learning: base.learning };

  // Match needs at least MIN_COUNT usable pairs in a theme to be worth offering.
  const picker = useContentPicker(
    "vocab",
    pair,
    categoriesOf(base as unknown as MatchObj),
    levelOf(base as unknown as MatchObj),
    MIN_COUNT,
  );
  const [count, setCount] = useState<string>(String(base.count));

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
      level: picker.level,
      count: clamp(parseInt(count, 10) || base.count, MIN_COUNT, MAX_COUNT),
    });
  }

  return (
    <>
      <h2>Match up</h2>
      <p className="hint">
        Draw a line from each <b>{knownName}</b> word to its <b>{learningName}</b>{" "}
        translation.
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label htmlFor="lmCount">How many pairs</label>
        <input
          id="lmCount"
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
