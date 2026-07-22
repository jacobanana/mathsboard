// Settings dialog for Fill the gaps. Pick the THEME + LEVEL (shared picker), the
// difficulty (pick vs type) and how many sentences.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { CategoryLevelPicker } from "@/lang/CategoryLevelPicker";
import { useContentPicker } from "@/lang/contentPicker";
import {
  MAX_ROUNDS,
  MIN_ROUNDS,
  categoryOf,
  levelOf,
  type Difficulty,
  type GapObj,
} from "@/tools/langgaps/gaps";
import { defaultLangGapsParams, type LangGapsParams } from "@/tools/langgaps";

export function LangGapsDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangGapsParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangGapsParams();
  const pair = { known: base.known, learning: base.learning };

  const picker = useContentPicker(
    "sentences",
    pair,
    categoryOf(base as unknown as GapObj),
    levelOf(base as unknown as GapObj),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(base.difficulty);
  const [rounds, setRounds] = useState<string>(String(base.rounds));

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      category: picker.category,
      level: picker.level,
      difficulty,
      rounds: clamp(parseInt(rounds, 10) || base.rounds, MIN_ROUNDS, MAX_ROUNDS),
    });
  }

  return (
    <>
      <h2>Fill the gaps</h2>
      <p className="hint">
        A sentence with one word missing. Fill in the blank — pick a word (easy)
        or type it (harder).
      </p>

      <CategoryLevelPicker picker={picker} />

      <div className="field">
        <label>How to answer</label>
        <div className="flash-opts">
          <button
            type="button"
            className={"flash-opt" + (difficulty === "pick" ? " active" : "")}
            onClick={() => setDifficulty("pick")}
          >
            🟢 Pick a word (easy)
          </button>
          <button
            type="button"
            className={"flash-opt" + (difficulty === "type" ? " active" : "")}
            onClick={() => setDifficulty("type")}
          >
            ⌨️ Type the word (harder)
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="gpRounds">How many sentences</label>
        <input
          id="gpRounds"
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
