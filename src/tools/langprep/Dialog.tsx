// Settings dialog for "Where is it?". Prepositions aren't themed, so there's no
// theme picker — just how many rounds. The languages come from the learner's
// current pair (read-only).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { MAX_ROUNDS, MIN_ROUNDS } from "@/tools/langprep/prep";
import { defaultLangPrepParams, type LangPrepParams } from "@/tools/langprep";

export function LangPrepDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangPrepParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangPrepParams();
  const [rounds, setRounds] = useState<string>(String(base.rounds));

  const learningName = languageByCode(base.learning)?.name ?? base.learning;

  function submit() {
    onSubmit({
      known: base.known,
      learning: base.learning,
      rounds: clamp(parseInt(rounds, 10) || base.rounds, MIN_ROUNDS, MAX_ROUNDS),
    });
  }

  return (
    <>
      <h2>Where is it?</h2>
      <p className="hint">
        A little picture of an object and a box. Tap the <b>{learningName}</b> word
        for where it is — on it, in it, under it…
      </p>

      <div className="field">
        <label htmlFor="ppRounds">How many rounds</label>
        <input
          id="ppRounds"
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
