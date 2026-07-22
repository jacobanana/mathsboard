// Settings dialog for the Conjugation game. Pick a verb (filtered by level), a
// tense, and how to practise (learn / pick / type). Languages come from the
// learner's current pair.

import { useMemo, useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import { languageByCode, LEVELS, LEVEL_LABEL, type Level } from "@/lang/data";
import {
  TENSES,
  infinitiveOf,
  verbById,
  verbLevelsFor,
  verbsFor,
} from "@/lang/conjugation";
import type { ConjMode } from "@/tools/langconjugate/conj";
import {
  defaultLangConjugateParams,
  type LangConjugateParams,
} from "@/tools/langconjugate";

type LevelFilter = Level | "mixed";

const MODE_LABEL: Record<ConjMode, string> = {
  learn: "📖 Learn it",
  pick: "🟢 Pick the forms",
  type: "⌨️ Type the forms",
};

export function LangConjugateDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<LangConjugateParams>) {
  const editing = initial != null;
  const base = initial ?? defaultLangConjugateParams();
  const pair = { known: base.known, learning: base.learning };
  const availLevels = verbLevelsFor(pair.learning);

  const startLevel = verbById(base.verb)?.level ?? availLevels[0] ?? "basic";
  const [level, setLevel] = useState<LevelFilter>(startLevel);
  const [verb, setVerb] = useState<string>(base.verb);
  const [tense, setTense] = useState<string>(base.tense);
  const [mode, setMode] = useState<ConjMode>(base.mode);

  const verbs = useMemo(() => verbsFor(pair.learning, level), [pair.learning, level]);

  const knownName = languageByCode(pair.known)?.name ?? pair.known;
  const learningName = languageByCode(pair.learning)?.name ?? pair.learning;

  function pickLevel(l: LevelFilter) {
    setLevel(l);
    // Keep a valid verb selected for the new level filter.
    const list = verbsFor(pair.learning, l);
    if (!list.some((v) => v.id === verb)) setVerb(list[0]?.id ?? verb);
  }

  function submit() {
    onSubmit({ known: pair.known, learning: pair.learning, verb, tense, mode });
  }

  return (
    <>
      <h2>Conjugation</h2>
      <p className="hint">
        Learn to conjugate a <b>{learningName}</b> verb, person by person. (From{" "}
        <b>{knownName}</b>.)
      </p>

      <div className="field">
        <label>Level</label>
        <div className="flash-opts">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={!availLevels.includes(l)}
              className={"flash-opt" + (level === l ? " active" : "")}
              onClick={() => pickLevel(l)}
            >
              {LEVEL_LABEL[l]}
            </button>
          ))}
          <button
            type="button"
            className={"flash-opt" + (level === "mixed" ? " active" : "")}
            onClick={() => pickLevel("mixed")}
          >
            All
          </button>
        </div>
      </div>

      <div className="field">
        <label>Verb</label>
        <div className="flash-opts">
          {verbs.map((v) => (
            <button
              key={v.id}
              type="button"
              className={"flash-opt" + (verb === v.id ? " active" : "")}
              onClick={() => setVerb(v.id)}
            >
              {infinitiveOf(v, pair.learning)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Tense</label>
        <div className="flash-opts">
          {TENSES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"flash-opt" + (tense === t.id ? " active" : "")}
              onClick={() => setTense(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>How to practise</label>
        <div className="flash-opts">
          {(["learn", "pick", "type"] as ConjMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={"flash-opt" + (mode === m ? " active" : "")}
              onClick={() => setMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
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
