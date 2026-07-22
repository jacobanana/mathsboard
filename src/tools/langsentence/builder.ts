// The sentence-builder engine — pure, deterministic, no React.
//
// A widget runs a session of "put the words in order" puzzles, ONE sentence per
// round. Each round shows a sentence in the KNOWN language as the prompt and the
// scrambled words of its translation as tiles; the learner taps the words in
// order to rebuild the sentence (tapping a tile again takes it back out), and it
// checks once every word is placed. Like the number-order game the rounds are
// re-derived from the widget's identity + `round` counter (seeded shuffle), and
// the response — the tapped CHAIN of tile indices per round — is live
// widget-state (`so:<i>` / checked flag `sc:<i>`), undo-invisible, synced and
// persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  categoriesFromObj,
  categoriesLabel,
  sentencesForCategories,
  type LangPair,
  type LevelFilter,
} from "@/lang/pairs";

/** The shape the component reads: params plus live widget-state (so:*, sc:*). */
export interface SentenceObj {
  id: string;
  known: string;
  learning: string;
  /** The themes drawn from. Older objects carry a single `category`/`set`. */
  categories?: string[];
  category?: string;
  set?: string;
  /** Difficulty filter; absent = "mixed" (all levels). */
  level?: LevelFilter;
  rounds: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  round?: number;
  idx?: number;
  [field: string]: unknown; // so:<i> -> "2,0,1"; sc:<i> -> 1 when checked
}

/** One round: the prompt (known language), the shuffled word tiles, and the
 *  target word order the tiles should be arranged into. */
export interface SentenceRound {
  prompt: string;
  tiles: string[];
  answer: string[];
}

export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 12;
export const DEFAULT_ROUNDS = 6;

export const clampRounds = (n: number | undefined): number =>
  Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.round(n ?? DEFAULT_ROUNDS)));

/** Split a sentence into word tiles on whitespace. Punctuation that stands
 *  alone (French "va ?") becomes its own tile; punctuation glued to a word
 *  ("Bonjour,") rides along with it — both are deterministic and language-safe. */
export const tokenize = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);

const pairOf = (obj: SentenceObj): LangPair => ({
  known: obj.known,
  learning: obj.learning,
});

/** The theme ids drawn from (supports several; legacy single `category`/`set`). */
export const categoriesOf = (obj: SentenceObj): string[] => categoriesFromObj(obj);
/** The level filter (absent = every level). */
export const levelOf = (obj: SentenceObj): LevelFilter => obj.level ?? "mixed";

/** Derive the whole session (its rounds) deterministically from state. */
export function deriveDeck(obj: SentenceObj): SentenceRound[] {
  const round = obj.round ?? 0;
  const sentences = sentencesForCategories(categoriesOf(obj), levelOf(obj), pairOf(obj));
  const rng = rngFromSeed(
    `${obj.id}:${round}:${categoriesOf(obj).join(",")}:${levelOf(obj)}:${obj.known}:${obj.learning}`,
  );
  const want = Math.min(clampRounds(obj.rounds), sentences.length);
  const chosen = shuffle(rng, sentences).slice(0, want);
  return chosen.map((s) => {
    const answer = tokenize(s.learning);
    // Scramble the tiles; reshuffle a few times if a short sentence lands back
    // in order, so the puzzle is never pre-solved on deal.
    let tiles = shuffle(rng, answer);
    for (let t = 0; t < 5 && answer.length > 1 && tiles.join(" ") === answer.join(" "); t++) {
      tiles = shuffle(rng, answer);
    }
    return { prompt: s.known, tiles, answer };
  });
}

/** The effective round count (bounded by the set's size). */
export const deckLength = (obj: SentenceObj): number => deriveDeck(obj).length;

export function deckTitle(obj: SentenceObj): string {
  return categoriesLabel(categoriesOf(obj), "Sentences");
}

// --- correctness ------------------------------------------------------------

/** The words a chain builds, in order (tiles resolved through the tapped
 *  indices). */
export const builtWords = (round: SentenceRound, chain: number[]): string[] =>
  chain.map((i) => round.tiles[i]);

/** Is `chain` a correct, complete answer? Compares the produced WORD sequence
 *  (not tile indices) so a sentence with a repeated word still checks right. */
export function roundCorrect(round: SentenceRound, chain: number[]): boolean {
  if (chain.length !== round.answer.length) return false;
  const built = builtWords(round, chain);
  return built.every((w, i) => w === round.answer[i]);
}

// --- the tap interaction (pure) ---------------------------------------------

export interface TapOutcome {
  chain: number[];
  checked: boolean;
  justChecked: boolean;
  correct: boolean;
}

/** Apply a tap on tile `j`. Returns null when the round is already checked.
 *  Adds `j` to the chain, or removes it when already present ("tap to undo"),
 *  and locks once every tile is placed. */
export function applyTap(
  round: SentenceRound,
  chain: number[],
  checked: boolean,
  j: number,
): TapOutcome | null {
  if (checked) return null;
  const next = chain.includes(j) ? chain.filter((x) => x !== j) : [...chain, j];
  if (next.length === round.tiles.length) {
    return { chain: next, checked: true, justChecked: true, correct: roundCorrect(round, next) };
  }
  return { chain: next, checked: false, justChecked: false, correct: false };
}

// --- per-round response (the learner's live state) --------------------------

export const CHAIN_PREFIX = "so:";
export const CHECK_PREFIX = "sc:";
export const chainField = (i: number): string => CHAIN_PREFIX + i;
export const checkField = (i: number): string => CHECK_PREFIX + i;

export function readChain(obj: SentenceObj, i: number): number[] {
  const v = obj[chainField(i)];
  if (typeof v !== "string" || v === "") return [];
  return v
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}

export const writeChain = (chain: number[]): string => chain.join(",");

export const isChecked = (obj: SentenceObj, i: number): boolean =>
  obj[checkField(i)] === 1 || obj[checkField(i)] === true;

export function tapStatePatch(i: number, out: TapOutcome): Record<string, unknown> {
  return {
    [chainField(i)]: out.chain.length ? writeChain(out.chain) : undefined,
    [checkField(i)]: out.checked ? 1 : undefined,
  };
}

/** Clear a single round back to untouched (Try again / Clear). */
export function retryPatch(i: number): Record<string, unknown> {
  return { [chainField(i)]: undefined, [checkField(i)]: undefined };
}

export function pruneResponses(obj: SentenceObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith(CHAIN_PREFIX) || k.startsWith(CHECK_PREFIX)) patch[k] = undefined;
  }
  return patch;
}

// --- summary ----------------------------------------------------------------

export interface ScoredRound {
  round: SentenceRound;
  correct: boolean;
}

export function scoreDeck(obj: SentenceObj, deck: SentenceRound[]): ScoredRound[] {
  return deck.map((round, i) => ({
    round,
    correct: isChecked(obj, i) && roundCorrect(round, readChain(obj, i)),
  }));
}

export const scoreCount = (scored: ScoredRound[]): number =>
  scored.reduce((n, s) => n + (s.correct ? 1 : 0), 0);

export function verdict(correct: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- session control --------------------------------------------------------

export const nextPatch = (obj: SentenceObj): Partial<SentenceObj> => ({
  idx: (obj.idx ?? 0) + 1,
});

export const replayPatch = (obj: SentenceObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});

export const newDeckPatch = (obj: SentenceObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  ...pruneResponses(obj),
});

export const resetSessionPatch = (obj: SentenceObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
