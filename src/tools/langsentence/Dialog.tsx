// Settings dialog for the Sentence builder. Pick the THEME + LEVEL (shared
// picker) and how many rounds; the languages come from the learner's current
// pair (shown read-only).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import {
  MAX_ROUNDS,
  MIN_ROUNDS,
  categoryOf,
  levelOf,
  type SentenceObj,
} from "@/tools/langsentence/builder";
import {
  defaultLangSentenceParams,
  type LangSentenceParams,
} from "@/tools/langsentence";

export function LangSentenceDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangSentenceParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangSentenceParams();
  const pair = { known: base.known, learning: base.learning };

  const picker = useContentPicker(
    "sentences",
    pair,
    categoryOf(base as unknown as SentenceObj),
    levelOf(base as unknown as SentenceObj),
  );
  const [rounds, setRounds] = useState<string>(String(base.rounds));

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      category: picker.category,
      level: picker.level,
      rounds: clamp(parseInt(rounds, 10) || base.rounds, MIN_ROUNDS, MAX_ROUNDS),
    });
  }

  return (
    <>
      <h2>Sentence builder</h2>
      <p className="hint">
        See a sentence in <b>{knownName}</b> and tap the <b>{learningName}</b>{" "}
        words into the right order.
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label htmlFor="sbRounds">How many sentences</label>
        <input
          id="sbRounds"
          type="number"
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          value={rounds}
          onChange={(e) => setRounds(e.target.value)}
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
