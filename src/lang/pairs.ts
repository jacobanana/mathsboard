// RESOLVING CONTENT FOR A LANGUAGE PAIR, BY CATEGORY AND LEVEL.
//
// Every widget works in terms of a { known, learning } pair — the language the
// learner already speaks and the one they are learning — never English↔French
// directly. These helpers turn the tagged catalogue (data.ts) into the concrete
// { known, learning } strings a widget shows, filtered by a chosen category
// (theme) and level, and dropping any item missing a word in either language so
// a half-translated entry never surfaces. Vocab and sentences share the SAME
// category/level system, so the pickers are identical everywhere. This is also
// what makes the app scale: add a language to data.ts and every widget can pair
// it with any other, with no widget changes.

import {
  CATEGORIES,
  LANGUAGES,
  LEVELS,
  SENTENCES,
  VOCAB,
  languageByCode,
  type Category,
  type LangCode,
  type Level,
} from "@/lang/data";

/** The learner's languages: what they know, and what they're learning. */
export interface LangPair {
  known: LangCode;
  learning: LangCode;
}

/** A vocabulary item resolved for a pair — both words guaranteed present. */
export interface VocabPair {
  known: string;
  learning: string;
  emoji?: string;
}

/** A sentence resolved for a pair — both translations guaranteed present. */
export interface SentencePairText {
  known: string;
  learning: string;
}

/** A level filter: one specific level, or "mixed" (every level). */
export type LevelFilter = Level | "mixed";

/** The default pair when nothing is stored yet: learn the second language using
 *  the first (English → French out of the box). Falls back gracefully if the
 *  catalogue somehow has fewer than two languages. */
export function defaultPair(): LangPair {
  const known = LANGUAGES[0]?.code ?? "en";
  const learning = LANGUAGES[1]?.code ?? LANGUAGES[0]?.code ?? "fr";
  return { known, learning };
}

/** True when both codes exist and differ — a usable learning pair. */
export function isValidPair(p: LangPair): boolean {
  return (
    p.known !== p.learning &&
    languageByCode(p.known) != null &&
    languageByCode(p.learning) != null
  );
}

/** A short human label for a pair, e.g. "English → French". */
export function pairLabel(p: LangPair): string {
  const k = languageByCode(p.known)?.name ?? p.known;
  const l = languageByCode(p.learning)?.name ?? p.learning;
  return `${k} → ${l}`;
}

const atLevel = (level: LevelFilter) => (itemLevel: Level): boolean =>
  level === "mixed" || itemLevel === level;

// --- vocabulary -------------------------------------------------------------

const asArray = (c: string | string[]): string[] => (Array.isArray(c) ? c : [c]);

/** Every vocab item of the given category (or categories) at `level` (or all
 *  levels when "mixed") that has BOTH the known and learning words. Multiple
 *  categories are gathered in catalogue order. */
export function vocabFor(
  category: string | string[],
  level: LevelFilter,
  pair: LangPair,
): VocabPair[] {
  const cats = new Set(asArray(category));
  const keep = atLevel(level);
  const out: VocabPair[] = [];
  for (const item of VOCAB) {
    if (!cats.has(item.category) || !keep(item.level)) continue;
    const known = item.terms[pair.known];
    const learning = item.terms[pair.learning];
    if (known && learning) out.push({ known, learning, emoji: item.emoji });
  }
  return out;
}

/** Which levels have at least one usable vocab pair across the given
 *  category/categories, in order. Lets a dialog disable empty levels. */
export function levelsForVocabCategory(category: string | string[], pair: LangPair): Level[] {
  return LEVELS.filter((l) => vocabFor(category, l, pair).length > 0);
}

/** Categories with at least `min` usable vocab pairs at `level` (or mixed). */
export function categoriesForVocab(
  pair: LangPair,
  level: LevelFilter,
  min = 1,
): Category[] {
  return CATEGORIES.filter((c) => vocabFor(c.id, level, pair).length >= min);
}

// --- sentences --------------------------------------------------------------

/** Every sentence of the given category (or categories) at `level` (or all
 *  levels when "mixed") that has BOTH translations. */
export function sentencesFor(
  category: string | string[],
  level: LevelFilter,
  pair: LangPair,
): SentencePairText[] {
  const cats = new Set(asArray(category));
  const keep = atLevel(level);
  const out: SentencePairText[] = [];
  for (const item of SENTENCES) {
    if (!cats.has(item.category) || !keep(item.level)) continue;
    const known = item.terms[pair.known];
    const learning = item.terms[pair.learning];
    if (known && learning) out.push({ known, learning });
  }
  return out;
}

export function levelsForSentenceCategory(category: string | string[], pair: LangPair): Level[] {
  return LEVELS.filter((l) => sentencesFor(category, l, pair).length > 0);
}

export function categoriesForSentences(
  pair: LangPair,
  level: LevelFilter,
  min = 1,
): Category[] {
  return CATEGORIES.filter((c) => sentencesFor(c.id, level, pair).length >= min);
}

/**
 * The selected theme ids for a widget object: the new `categories` array, or a
 * legacy single `category` / `topic` / `set` key wrapped in an array. Keeps
 * older boards working after the move to multi-select themes.
 */
export function categoriesOf(obj: {
  categories?: string[];
  category?: string;
  topic?: string;
  set?: string;
}): string[] {
  if (Array.isArray(obj.categories) && obj.categories.length > 0) return obj.categories;
  const single = obj.category ?? obj.topic ?? obj.set;
  return single ? [single] : [];
}

// --- shared dialog helpers --------------------------------------------------

/** Resolve a starting level for a category: keep `wanted` if the category has
 *  content at it, else fall back to the first available level, else "mixed". */
export function resolveLevel(
  available: Level[],
  wanted: LevelFilter,
): LevelFilter {
  if (wanted === "mixed") return "mixed";
  if (available.includes(wanted)) return wanted;
  return available[0] ?? "mixed";
}
