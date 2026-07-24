// A small hook backing the shared theme + level picker used by every language
// tool dialog. It owns the theme(s) and level selection and keeps them
// consistent: SEVERAL themes can be chosen at once, the theme list is stable
// (every theme that has ANY content for this pair), and the level snaps to one
// the chosen themes actually offer (their union).

import { useMemo, useState } from "react";
import type { Category, Level } from "@/lang/data";
import {
  categoriesForArticleNouns,
  categoriesForSentences,
  categoriesForVocab,
  levelsForArticleCategories,
  levelsForSentenceCategories,
  levelsForVocabCategories,
  resolveLevel,
  type LangPair,
  type LevelFilter,
} from "@/lang/pairs";

export type ContentKind = "vocab" | "sentences" | "gender";

const CATS_OF = {
  vocab: categoriesForVocab,
  sentences: categoriesForSentences,
  gender: categoriesForArticleNouns,
} as const;

const LEVELS_OF = {
  vocab: levelsForVocabCategories,
  sentences: levelsForSentenceCategories,
  gender: levelsForArticleCategories,
} as const;

export interface ContentPicker {
  /** The chosen theme ids — always at least one. */
  selected: string[];
  level: LevelFilter;
  /** Themes with content for this pair (stable — independent of level). */
  categories: Category[];
  /** Levels the CURRENT theme set can offer between them (others are disabled). */
  availableLevels: Level[];
  /** Add or remove a theme; the last remaining theme can't be removed. */
  toggle(id: string): void;
  setLevel(level: LevelFilter): void;
}

export function useContentPicker(
  kind: ContentKind,
  pair: LangPair,
  initialCategories: string[] | undefined,
  initialLevel: LevelFilter | undefined,
  /** Minimum items a theme must have (at any level) to be offered. */
  minCategory = 1,
): ContentPicker {
  const catsOf = CATS_OF[kind];
  const levelsOf = LEVELS_OF[kind];

  const categories = useMemo(
    () => catsOf(pair, "mixed", minCategory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, pair.known, pair.learning, minCategory],
  );

  const order = useMemo(() => categories.map((c) => c.id), [categories]);
  const sortByOrder = (ids: string[]): string[] =>
    ids.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));

  const [selected, setSelected] = useState<string[]>(() => {
    const valid = (initialCategories ?? []).filter((id) => order.includes(id));
    return valid.length ? sortByOrder(valid) : categories[0] ? [categories[0].id] : [];
  });
  const [level, setLevel] = useState<LevelFilter>(initialLevel ?? "basic");

  const availableLevels = useMemo(
    () => levelsOf(selected, pair),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, selected.join(","), pair.known, pair.learning],
  );

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((c) => c !== id)
      : [...selected, id];
    if (next.length === 0) return; // keep at least one theme selected
    const sorted = sortByOrder(next);
    setSelected(sorted);
    // Keep the level valid for the new theme set (snap to one they offer).
    setLevel((cur) => resolveLevel(levelsOf(sorted, pair), cur));
  }

  return { selected, level, categories, availableLevels, toggle, setLevel };
}
