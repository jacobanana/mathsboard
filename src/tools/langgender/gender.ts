// The gender-sort engine — pure, deterministic, no React.
//
// A widget shows a pile of nouns and two-or-more baskets, one per definite
// article the learning language uses (French le / la, German der / die / das).
// The learner taps a word, then taps the basket it belongs in. A right drop
// locks green; a wrong one turns red and can be tapped to send the word back to
// the pile and try again. Like the other language widgets the round is
// re-derived from the widget's identity + `round` counter (a seeded shuffle), so
// every collaborator sees the SAME words with no write races, and the response —
// each word's chosen basket — is live widget-state (`gb:<i>` = the basket index
// it was dropped in), undo-invisible, synced and persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  articleNounsForCategories,
  articlesForLearning,
  categoriesFromObj,
  categoriesLabel,
  type ArticleNoun,
  type LangPair,
  type LevelFilter,
} from "@/lang/pairs";

/** The shape the component reads: params plus live widget-state (gb:*). */
export interface GenderObj {
  id: string;
  known: string;
  learning: string;
  /** The themes drawn from. Older objects carry a single `category`. */
  categories?: string[];
  category?: string;
  topic?: string;
  level?: LevelFilter;
  count: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new game" counter; the round is re-derived from it. */
  round?: number;
  [field: string]: unknown; // gb:<i> -> the basket index word i was dropped in
}

/** A resolved round: the words to sort (pile order) and the baskets (articles). */
export interface GenderRound {
  items: ArticleNoun[];
  /** The distinct articles, in a stable order — one basket each. */
  buckets: string[];
}

export const MIN_COUNT = 4;
export const MAX_COUNT = 10;
export const DEFAULT_COUNT = 6;

export const clampCount = (n: number | undefined): number =>
  Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(n ?? DEFAULT_COUNT)));

const pairOf = (obj: GenderObj): LangPair => ({ known: obj.known, learning: obj.learning });

export const categoriesOf = (obj: GenderObj): string[] => categoriesFromObj(obj);
export const levelOf = (obj: GenderObj): LevelFilter => obj.level ?? "mixed";

/** Derive a widget's round deterministically from its state. */
export function deriveRound(obj: GenderObj): GenderRound {
  const round = obj.round ?? 0;
  const pair = pairOf(obj);
  const nouns = articleNounsForCategories(categoriesOf(obj), levelOf(obj), pair);
  const rng = rngFromSeed(
    `${obj.id}:${round}:${categoriesOf(obj).join(",")}:${levelOf(obj)}:${obj.known}:${obj.learning}`,
  );
  const want = Math.min(clampCount(obj.count), nouns.length);
  const items = shuffle(rng, nouns).slice(0, want);
  // Baskets = the articles actually present in this round, ordered by the
  // language's overall article order (so "le" is always left of "la").
  const order = articlesForLearning(pair);
  const present = new Set(items.map((n) => n.article));
  const buckets = order.filter((a) => present.has(a));
  // Any article not in the language-wide list (an unusual pack) still gets a
  // basket, appended in first-appearance order.
  for (const n of items) if (!buckets.includes(n.article)) buckets.push(n.article);
  return { items, buckets };
}

export const roundSize = (obj: GenderObj): number => deriveRound(obj).items.length;

export function title(obj: GenderObj): string {
  return categoriesLabel(categoriesOf(obj), "Sort by gender");
}

// --- placements (the learner's live state) ----------------------------------
// Each word stores the basket index it was dropped in, in `gb:<i>`. Correctness
// is derived from the round (does that basket's article match the word's?), so
// it can never drift.

export const PLACE_PREFIX = "gb:";
export const placeField = (i: number): string => PLACE_PREFIX + i;

/** The basket index word `i` was dropped in, or null if it's still in the pile. */
export function placedBucket(obj: GenderObj, i: number): number | null {
  const v = obj[placeField(i)];
  return typeof v === "number" ? v : null;
}

/** Is word `i` dropped in the basket whose article matches it? */
export function isCardCorrect(round: GenderRound, obj: GenderObj, i: number): boolean {
  const b = placedBucket(obj, i);
  return b != null && round.buckets[b] === round.items[i]?.article;
}

/** Is word `i` dropped but in the WRONG basket? */
export function isCardWrong(round: GenderRound, obj: GenderObj, i: number): boolean {
  const b = placedBucket(obj, i);
  return b != null && round.buckets[b] !== round.items[i]?.article;
}

/** How many words are correctly sorted. */
export function correctCount(round: GenderRound, obj: GenderObj): number {
  let n = 0;
  for (let i = 0; i < round.items.length; i++) if (isCardCorrect(round, obj, i)) n++;
  return n;
}

export const allSorted = (obj: GenderObj): boolean => {
  const round = deriveRound(obj);
  return round.items.length > 0 && correctCount(round, obj) === round.items.length;
};

/** The word indices currently in basket `b`. */
export function cardsInBucket(round: GenderRound, obj: GenderObj, b: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < round.items.length; i++) if (placedBucket(obj, i) === b) out.push(i);
  return out;
}

/** The word indices still in the pile (unsorted). */
export function pileCards(round: GenderRound, obj: GenderObj): number[] {
  const out: number[] = [];
  for (let i = 0; i < round.items.length; i++) if (placedBucket(obj, i) == null) out.push(i);
  return out;
}

/** Drop word `i` into basket `b`. */
export const placePatch = (i: number, b: number): Record<string, unknown> => ({
  [placeField(i)]: b,
});

/** Send word `i` back to the pile (a wrong-drop "try again"). */
export const removePatch = (i: number): Record<string, unknown> => ({
  [placeField(i)]: undefined,
});

export function pruneResponses(obj: GenderObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) if (k.startsWith(PLACE_PREFIX)) patch[k] = undefined;
  return patch;
}

/** A fresh deal: new words (bump round) with nothing sorted. */
export const newRoundPatch = (obj: GenderObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  ...pruneResponses(obj),
});

/** Reset after a settings edit (see resetOnEdit): clear the placements. */
export const resetSessionPatch = (obj: GenderObj): Record<string, unknown> =>
  pruneResponses(obj);
