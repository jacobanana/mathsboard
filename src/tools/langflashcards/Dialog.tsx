// Settings dialog for the vocabulary flash cards.
//
// Conventions match the maths tool dialogs (see flashcards/Dialog.tsx): props
// are ToolDialogProps; EDIT vs CREATE is decided by `initial`. The languages are
// fixed to the learner's current pair at creation and shown read-only here; the
// learner picks the TOPIC, the direction and the deck size. The tool restarts
// its session on save (resetOnEdit), so changing settings never leaves a
// half-played deck.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import { languageByCode } from "@/lang/data";
import { usableTopics } from "@/lang/pairs";
import {
  MAX_COUNT,
  MIN_COUNT,
  type Direction,
} from "@/tools/langflashcards/deck";
import {
  defaultLangFlashParams,
  type LangFlashParams,
} from "@/tools/langflashcards";

export function LangFlashDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangFlashParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangFlashParams();
  const pair = { known: base.known, learning: base.learning };
  const topics = usableTopics(pair);

  const [topic, setTopic] = useState<string>(base.topic);
  const [direction, setDirection] = useState<Direction>(base.direction);
  const [count, setCount] = useState<string>(String(base.count));

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      topic,
      direction,
      count: clamp(parseInt(count, 10) || base.count, MIN_COUNT, MAX_COUNT),
    });
  }

  return (
    <>
      <h2>Flash cards</h2>
      <p className="hint">
        Learning <b>{learningName}</b> from <b>{knownName}</b>. See a word, flip
        to check, and say if you knew it.
      </p>

      <div className="field">
        <label>Topic</label>
        <div className="flash-opts">
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"flash-opt" + (topic === t.id ? " active" : "")}
              onClick={() => setTopic(t.id)}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Show first</label>
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

      <div className="field">
        <label htmlFor="lfCount">How many cards</label>
        <input
          id="lfCount"
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
