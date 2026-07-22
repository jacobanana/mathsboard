// The match-the-translation engine — pure, deterministic, no React.
//
// A widget shows two columns: words in the known language on the left, their
// translations (scrambled) on the right. The learner draws a line from a word to
// its translation. Every connection is KEPT and coloured by correctness: green
// when right, red when wrong. A correct line locks; a wrong one can be removed by
// tapping the line (or either of its words) to try again. Like the other
// language widgets the round is re-derived from the widget's identity + `round`
// counter (seeded shuffles), so every collaborator sees the SAME columns with no
// write races, and the response — each left word's connection — is live
// widget-state (`mc:<leftIdx>` = the right slot it joins to), undo-invisible,
// synced and persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  vocabFor,
  type LangPair,
  type LevelFilter,
  type VocabPair,
} from "@/lang/pairs";
import { categoryById } from "@/lang/data";

/** The shape the component reads: params plus live widget-state (mc:*). */
export interface MatchObj {
  id: string;
  known: string;
  learning: string;
  /** The theme (category id). Legacy objects may carry `topic` instead. */
  category?: string;
  topic?: string;
  /** Difficulty filter; absent = "mixed" (all levels). */
  level?: LevelFilter;
  count: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new game" counter; the round is re-derived from it. */
  round?: number;
  [field: string]: unknown; // mc:<leftIdx> -> the right slot it is joined to
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

/** The theme id (new `category`, falling back to a legacy `topic`). */
export const categoryOf = (obj: MatchObj): string => obj.category ?? obj.topic ?? "";
/** The level filter (absent = every level). */
export const levelOf = (obj: MatchObj): LevelFilter => obj.level ?? "mixed";

/** Derive a widget's round deterministically from its state. */
export function deriveRound(obj: MatchObj): MatchRound {
  const round = obj.round ?? 0;
  const pairs = vocabFor(categoryOf(obj), levelOf(obj), pairOf(obj));
  const rng = rngFromSeed(
    `${obj.id}:${round}:${categoryOf(obj)}:${levelOf(obj)}:${obj.known}:${obj.learning}`,
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
  const cat = categoryById(categoryOf(obj));
  return cat ? cat.label : "Match up";
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

// --- connections (the learner's live state) ---------------------------------
// Each left word stores the right SLOT it is joined to, in `mc:<leftIdx>`. A
// left word has at most one connection; correctness is derived from the round,
// never stored, so it can't drift.

export const CONN_PREFIX = "mc:";
export const connField = (i: number): string => CONN_PREFIX + i;

/** The right slot left word `i` is joined to, or null if it isn't joined. */
export function connectionSlot(obj: MatchObj, i: number): number | null {
  const v = obj[connField(i)];
  return typeof v === "number" ? v : null;
}

export interface Connection {
  left: number;
  right: number;
  correct: boolean;
}

/** Every current connection, resolved with its correctness for the round. */
export function connections(round: MatchRound, obj: MatchObj): Connection[] {
  const out: Connection[] = [];
  for (let left = 0; left < round.items.length; left++) {
    const right = connectionSlot(obj, left);
    if (right == null) continue;
    out.push({ left, right, correct: isConnectionCorrect(round, left, right) });
  }
  return out;
}

/** Right slots that already have a connection into them (occupied). */
export function occupiedRightSlots(round: MatchRound, obj: MatchObj): Set<number> {
  return new Set(connections(round, obj).map((c) => c.right));
}

/** Is left word `i` joined AND correct? */
export function leftIsCorrect(round: MatchRound, obj: MatchObj, i: number): boolean {
  const right = connectionSlot(obj, i);
  return right != null && isConnectionCorrect(round, i, right);
}

/** How many left words are correctly joined. */
export function correctCount(round: MatchRound, obj: MatchObj): number {
  let n = 0;
  for (let i = 0; i < round.items.length; i++) if (leftIsCorrect(round, obj, i)) n++;
  return n;
}

export const allMatched = (obj: MatchObj): boolean => {
  const round = deriveRound(obj);
  return round.items.length > 0 && correctCount(round, obj) === round.items.length;
};

/** Join left word `left` to right slot `right`. */
export const connectPatch = (left: number, right: number): Record<string, unknown> => ({
  [connField(left)]: right,
});

/** Remove left word `left`'s connection (a wrong-line "try again"). */
export const disconnectPatch = (left: number): Record<string, unknown> => ({
  [connField(left)]: undefined,
});

export function pruneConnections(obj: MatchObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) if (k.startsWith(CONN_PREFIX)) patch[k] = undefined;
  return patch;
}

/** A fresh scramble: new right order (bump round) with nothing joined. */
export const newRoundPatch = (obj: MatchObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  ...pruneConnections(obj),
});

/** Reset after a settings edit (see resetOnEdit): clear the connections. */
export const resetSessionPatch = (obj: MatchObj): Record<string, unknown> =>
  pruneConnections(obj);
