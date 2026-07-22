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
        <label htmlFor="cjLevel">Level</label>
        <select
          id="cjLevel"
          value={level}
          onChange={(e) => pickLevel(e.target.value as LevelFilter)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l} disabled={!availLevels.includes(l)}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
          <option value="mixed">All</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="cjVerb">Verb</label>
        <select id="cjVerb" value={verb} onChange={(e) => setVerb(e.target.value)}>
          {verbs.map((v) => (
            <option key={v.id} value={v.id}>
              {infinitiveOf(v, pair.learning)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="cjTense">Tense</label>
        <select id="cjTense" value={tense} onChange={(e) => setTense(e.target.value)}>
          {TENSES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="cjMode">How to practise</label>
        <select
          id="cjMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as ConjMode)}
        >
          {(["learn", "pick", "type"] as ConjMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
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
