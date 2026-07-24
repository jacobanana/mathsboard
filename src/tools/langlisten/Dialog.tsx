// Settings dialog for "Listen & choose". Pick the THEME(S) + LEVEL (shared
// picker) and how many rounds; the languages come from the learner's current
// pair (read-only).

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import { categoriesFromObj } from "@/lang/pairs";
import { MAX_ROUNDS, MIN_ROUNDS, levelOf, type ListenObj } from "@/tools/langlisten/listen";
import { defaultLangListenParams, type LangListenParams } from "@/tools/langlisten";

export function LangListenDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangListenParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangListenParams();
  const pair = { known: base.known, learning: base.learning };

  const picker = useContentPicker(
    "vocab",
    pair,
    categoriesFromObj(base as unknown as ListenObj),
    levelOf(base as unknown as ListenObj),
  );
  const [rounds, setRounds] = useState<string>(String(base.rounds));

  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
      category: picker.selected[0],
      level: picker.level,
      rounds: clamp(parseInt(rounds, 10) || base.rounds, MIN_ROUNDS, MAX_ROUNDS),
    });
  }

  return (
    <>
      <h2>Listen &amp; choose</h2>
      <p className="hint">
        Hear a <b>{learningName}</b> word, then tap the picture that matches it.
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label htmlFor="lsRounds">How many rounds</label>
        <input
          id="lsRounds"
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
