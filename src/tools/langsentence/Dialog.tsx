// Settings dialog for the Sentence builder. Pick the sentence SET and how many
// rounds; the languages come from the learner's current pair (shown read-only).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { usableSentenceSets } from "@/lang/pairs";
import { MAX_ROUNDS, MIN_ROUNDS } from "@/tools/langsentence/builder";
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
  const sets = usableSentenceSets(pair);

  const [set, setSet] = useState<string>(base.set);
  const [rounds, setRounds] = useState<string>(String(base.rounds));

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      set,
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

      <div className="field">
        <label>Sentences</label>
        <div className="flash-opts">
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              className={"flash-opt" + (set === s.id ? " active" : "")}
              onClick={() => setSet(s.id)}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      </div>

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
