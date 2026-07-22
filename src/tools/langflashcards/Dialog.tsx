// Settings dialog for the vocabulary flash cards.
//
// EDIT vs CREATE is decided by `initial`. Languages are fixed to the learner's
// current pair (shown read-only); the learner picks the THEME + LEVEL (shared
// CategoryLevelPicker), the direction, the deck size and whether pictures show
// (easy mode). A deck built from "My words" carries its own words, so the theme
// picker and count are hidden for it. The tool restarts its session on save
// (resetOnEdit), so changing settings never leaves a half-played deck.

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
  type Direction,
  type LangFlashObj,
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
  const custom = base.custom;
  const isCustom = Array.isArray(custom) && custom.length > 0;

  const picker = useContentPicker(
    "vocab",
    pair,
    categoriesFromObj(base as unknown as LangFlashObj),
    levelOf(base as unknown as LangFlashObj),
  );
  const [direction, setDirection] = useState<Direction>(base.direction);
  const [count, setCount] = useState<string>(String(base.count));
  const [easy, setEasy] = useState<boolean>(base.easy);

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function submit() {
    onSubmit({
      known: pair.known,
      learning: pair.learning,
      categories: picker.selected,
      category: picker.selected[0],
      level: picker.level,
      direction,
      count: clamp(parseInt(count, 10) || base.count, MIN_COUNT, MAX_COUNT),
      easy,
      ...(isCustom ? { custom } : {}),
    });
  }

  return (
    <>
      <h2>Flash cards</h2>
      <p className="hint">
        Learning <b>{learningName}</b> from <b>{knownName}</b>. See a word, flip
        to check, and say if you knew it.
      </p>

      {isCustom ? (
        <div className="field">
          <label>Words</label>
          <div className="lf-customnote">
            📝 Your own words — {custom!.length} in the deck.
          </div>
        </div>
      ) : (
        <CategoryLevelPicker picker={picker} />
      )}

      <div className="field">
        <label htmlFor="lfDir">Show first</label>
        <select
          id="lfDir"
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
        >
          <option value="known-first">{knownName} → {learningName}</option>
          <option value="learning-first">{learningName} → {knownName}</option>
        </select>
      </div>

      {!isCustom && (
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
      )}

      <div className="field">
        <label className="flash-toggle">
          <input type="checkbox" checked={easy} onChange={(e) => setEasy(e.target.checked)} />
          <span>Easy mode — show a picture on each card</span>
        </label>
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
