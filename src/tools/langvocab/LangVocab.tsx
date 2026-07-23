// WIDGET COMPONENT — the Word list notepad. A thin adapter over the shared
// StudyNotepad (src/lang/StudyNotepad): it resolves one page per chosen theme
// (headword + meaning + pronunciation, in the learner's direction) and hands
// them to the shared body, which owns the chrome, paging, hide-answers toggle
// and drag. Content comes from lang/pairs, resolved live.

import { useMemo } from "react";
import type { WidgetProps } from "@/tools/registry";
import { StudyNotepad, type StudyPage } from "@/lang/StudyNotepad";
import { categoryById } from "@/lang/data";
import { categoriesFromObj, vocabFor, type LevelFilter } from "@/lang/pairs";
import type { LangVocabParams } from "@/tools/langvocab";

export function LangVocab({ obj }: WidgetProps<LangVocabParams>) {
  const level: LevelFilter = obj.level ?? "mixed";
  const pair = { known: obj.known, learning: obj.learning };
  // The headword is the language the learner is studying, unless they flipped it.
  const headIsLearning = obj.direction !== "known-first";
  const headCode = headIsLearning ? obj.learning : obj.known;
  const glossCode = headIsLearning ? obj.known : obj.learning;

  // One page per chosen theme; themes with no usable words are dropped so a
  // learner never turns to a blank page.
  const pages = useMemo<StudyPage[]>(() => {
    return categoriesFromObj(obj)
      .map((id) => ({
        id,
        label: categoryById(id)?.label ?? id,
        emoji: categoryById(id)?.emoji ?? "📄",
        rows: vocabFor(id, level, pair).map((w) => ({
          emoji: w.emoji,
          lead: headIsLearning ? w.learning : w.known,
          leadCode: headCode,
          leadPhonetic: headIsLearning ? w.learningPhonetic : w.knownPhonetic,
          answer: headIsLearning ? w.known : w.learning,
          answerCode: glossCode,
        })),
      }))
      .filter((p) => p.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.categories, obj.category, obj.level, obj.known, obj.learning, obj.direction]);

  return (
    <StudyNotepad
      obj={obj}
      pages={pages}
      variant="vocab"
      headEmojiFallback="📒"
      titleFallback="Word list"
      emptyText="No words yet for these themes."
      tool="langvocab"
    />
  );
}
