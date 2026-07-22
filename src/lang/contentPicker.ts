// A small hook backing the shared theme + level picker used by every language
// tool dialog. It owns the SELECTED themes (one or more) and the level, keeping
// them consistent: the theme list is stable (every theme with content for this
// pair), and changing the selection snaps the level to one the selection offers.

import { useMemo, useState } from "react";
import type { Category, Level } from "@/lang/data";
import {
  categoriesForSentences,
  categoriesForVocab,
  levelsForSentenceCategory,
  levelsForVocabCategory,
  resolveLevel,
  type LangPair,
  type LevelFilter,
} from "@/lang/pairs";

export type ContentKind = "vocab" | "sentences";

export interface ContentPicker {
  /** The chosen theme ids (one or more). */
  selected: string[];
  level: LevelFilter;
  /** Themes with content for this pair (stable — independent of level). */
  categories: Category[];
  /** Levels the CURRENT selection can offer (others are disabled). */
  availableLevels: Level[];
  /** Add / remove a theme (never empties the selection). */
  toggleCategory(id: string): void;
  setLevel(level: LevelFilter): void;
}

export function useContentPicker(
  kind: ContentKind,
  pair: LangPair,
  initialCategories: string[],
  initialLevel: LevelFilter | undefined,
  /** Minimum items a theme must have (at any level) to be offered. */
  minCategory = 1,
): ContentPicker {
  const catsOf = kind === "vocab" ? categoriesForVocab : categoriesForSentences;
  const levelsOf = kind === "vocab" ? levelsForVocabCategory : levelsForSentenceCategory;

  const categories = useMemo(
    () => catsOf(pair, "mixed", minCategory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, pair.known, pair.learning, minCategory],
  );

  const [selected, setSelected] = useState<string[]>(() => {
    const valid = initialCategories.filter((id) => categories.some((c) => c.id === id));
    return valid.length ? valid : categories[0] ? [categories[0].id] : [];
  });
  const [level, setLevel] = useState<LevelFilter>(initialLevel ?? "basic");

  const availableLevels = useMemo(
    () => (selected.length ? levelsOf(selected, pair) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, selected, pair.known, pair.learning],
  );

  function toggleCategory(id: string) {
    setSelected((cur) => {
      const next = cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id];
      if (next.length === 0) return cur; // keep at least one theme
      setLevel((lv) => resolveLevel(levelsOf(next, pair), lv));
      return next;
    });
  }

  return { selected, level, categories, availableLevels, toggleCategory, setLevel };
}
