// WIDGET COMPONENT — the Sentences phrasebook. A thin adapter over the shared
// StudyNotepad (src/lang/StudyNotepad): it resolves one page per chosen theme
// (each sentence + its translation + pronunciation, in the learner's direction)
// and hands them to the shared body, which owns the chrome, paging,
// hide-answers toggle and drag. Content comes from lang/pairs, resolved live.

import { useMemo } from "react";
import type { WidgetProps } from "@/tools/registry";
import { StudyNotepad, type StudyPage } from "@/lang/StudyNotepad";
import { categoryById } from "@/lang/data";
import { categoriesFromObj, sentencesFor, type LevelFilter } from "@/lang/pairs";
import type { LangPhrasesParams } from "@/tools/langphrases";

export function LangPhrases({ obj }: WidgetProps<LangPhrasesParams>) {
  const level: LevelFilter = obj.level ?? "mixed";
  const pair = { known: obj.known, learning: obj.learning };
  // Which language leads each row (the other is its translation, shown beneath).
  const promptIsKnown = obj.direction !== "learning-first";
  const promptCode = promptIsKnown ? obj.known : obj.learning;
  const answerCode = promptIsKnown ? obj.learning : obj.known;

  // One page per chosen theme; themes with no usable sentences are dropped so a
  // learner never turns to a blank page.
  const pages = useMemo<StudyPage[]>(() => {
    return categoriesFromObj(obj)
      .map((id) => ({
        id,
        label: categoryById(id)?.label ?? id,
        emoji: categoryById(id)?.emoji ?? "💬",
        rows: sentencesFor(id, level, pair).map((s) => ({
          lead: promptIsKnown ? s.known : s.learning,
          leadCode: promptCode,
          leadPhonetic: promptIsKnown ? s.knownPhonetic : s.learningPhonetic,
          answer: promptIsKnown ? s.learning : s.known,
          answerCode,
          answerPhonetic: promptIsKnown ? s.learningPhonetic : s.knownPhonetic,
        })),
      }))
      .filter((p) => p.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.categories, obj.category, obj.level, obj.known, obj.learning, obj.direction]);

  return (
    <StudyNotepad
      obj={obj}
      pages={pages}
      variant="phrases"
      headEmojiFallback="💬"
      titleFallback="Sentences"
      emptyText="No sentences yet for these themes."
      tool="langphrases"
    />
  );
}
