// The match-the-translation engine — pure, deterministic, no React.
//
// A widget shows two columns: words in the known language on the left, their
// translations (scrambled) on the right. The learner draws a line from a word to
// its translation; a correct line locks green, a wrong one is rejected. Like the
// other language widgets the round is re-derived from the widget's identity +
// `round` counter (seeded shuffles), so every collaborator sees the SAME columns
// with no write races, and the response — which left words are matched — is live
// widget-state (`mm:<i>` flags), undo-invisible, synced and persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import { vocabForTopic, type LangPair, type VocabPair } from "@/lang/pairs";
import { topicById } from "@/lang/data";

/** The shape the component reads: params plus live widget-state (mm:*). */
export interface MatchObj {
  id: string;
  known: string;
  learning: string;
  topic: string;
  count: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new game" counter; the round is re-derived from it. */
  round?: number;
  [field: string]: unknown; // mm:<leftIdx> -> 1 once that word is matched
}

/** A resolved round: the vocab items (left order), plus the scrambled order in
 *  which their translations appear on the right. `right[r]` shows the learning
 *  word of `items[rightOrder[r]]`. */
export interface MatchRound {
  items: VocabPair[];
  left: string[];
  emojis: (string | undefined)[];
  right: string[];
  rightOrder: number[];
}

export const MIN_COUNT = 3;
export const MAX_COUNT = 8;
export const DEFAULT_COUNT = 5;

export const clampCount = (n: number | undefined): number =>
  Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(n ?? DEFAULT_COUNT)));

const pairOf = (obj: MatchObj): LangPair => ({
  known: obj.known,
  learning: obj.learning,
});

/** Derive a widget's round deterministically from its state. */
export function deriveRound(obj: MatchObj): MatchRound {
  const round = obj.round ?? 0;
  const pairs = vocabForTopic(obj.topic, pairOf(obj));
  const rng = rngFromSeed(
    `${obj.id}:${round}:${obj.topic}:${obj.known}:${obj.learning}`,
  );
  const want = Math.min(clampCount(obj.count), pairs.length);
  const items = shuffle(rng, pairs).slice(0, want);
  // Scramble the right column; reshuffle if it landed in the identity order so
  // the answer is never trivially aligned row-for-row.
  let rightOrder = shuffle(rng, items.map((_, i) => i));
  for (let t = 0; t < 5 && want > 1 && rightOrder.every((v, i) => v === i); t++) {
    rightOrder = shuffle(rng, rightOrder);
  }
  return {
    items,
    left: items.map((v) => v.known),
    emojis: items.map((v) => v.emoji),
    right: rightOrder.map((k) => items[k].learning),
    rightOrder,
  };
}

export const roundSize = (obj: MatchObj): number => deriveRound(obj).items.length;

export function title(obj: MatchObj): string {
  const topic = topicById(obj.topic);
  return topic ? topic.label : "Match up";
}

// --- connection validity ----------------------------------------------------

/** The right-column SLOT that correctly matches left word `i` (its translation
 *  sits at the slot whose scrambled index points back to `i`). */
export function correctSlotFor(round: MatchRound, leftIdx: number): number {
  return round.rightOrder.indexOf(leftIdx);
}

/** Is connecting left word `leftIdx` to right slot `rightSlot` correct? */
export function isConnectionCorrect(
  round: MatchRound,
  leftIdx: number,
  rightSlot: number,
): boolean {
  return round.rightOrder[rightSlot] === leftIdx;
}

// --- matched state (the learner's live state) -------------------------------

export const MATCH_PREFIX = "mm:";
export const matchField = (i: number): string => MATCH_PREFIX + i;

export const isMatched = (obj: MatchObj, i: number): boolean =>
  obj[matchField(i)] === 1 || obj[matchField(i)] === true;

export function matchedCount(obj: MatchObj, size: number): number {
  let n = 0;
  for (let i = 0; i < size; i++) if (isMatched(obj, i)) n++;
  return n;
}

export const allMatched = (obj: MatchObj): boolean => {
  const size = roundSize(obj);
  return size > 0 && matchedCount(obj, size) === size;
};

/** Patch marking left word `i` matched. */
export const matchPatch = (i: number): Record<string, unknown> => ({
  [matchField(i)]: 1,
});

export function pruneMatches(obj: MatchObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) if (k.startsWith(MATCH_PREFIX)) patch[k] = undefined;
  return patch;
}

/** A fresh scramble: new right order (bump round) with nothing matched. */
export const newRoundPatch = (obj: MatchObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  ...pruneMatches(obj),
});

/** Reset after a settings edit (see resetOnEdit): clear the matches. */
export const resetSessionPatch = (obj: MatchObj): Record<string, unknown> =>
  pruneMatches(obj);
