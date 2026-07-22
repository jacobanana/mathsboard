// A small hook backing the shared category + level picker used by every language
// tool dialog. It owns the theme/level selection and keeps them consistent: the
// category list is stable (every theme that has ANY content for this pair), and
// switching theme snaps the level to one the new theme actually offers.

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
  category: string;
  level: LevelFilter;
  /** Themes with content for this pair (stable — independent of level). */
  categories: Category[];
  /** Levels the CURRENT category can offer (others are disabled). */
  availableLevels: Level[];
  setCategory(id: string): void;
  setLevel(level: LevelFilter): void;
}

export function useContentPicker(
  kind: ContentKind,
  pair: LangPair,
  initialCategory: string | undefined,
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

  const [category, setCategoryState] = useState<string>(
    initialCategory && categories.some((c) => c.id === initialCategory)
      ? initialCategory
      : categories[0]?.id ?? "",
  );
  const [level, setLevel] = useState<LevelFilter>(initialLevel ?? "basic");

  const availableLevels = useMemo(
    () => levelsOf(category, pair),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, category, pair.known, pair.learning],
  );

  function setCategory(id: string) {
    setCategoryState(id);
    // Keep the level valid for the new theme (snap to one it offers).
    setLevel((cur) => resolveLevel(levelsOf(id, pair), cur));
  }

  return { category, level, categories, availableLevels, setCategory, setLevel };
}
