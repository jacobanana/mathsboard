// The "where is it?" engine — pure, deterministic, no React.
//
// A widget runs a session of rounds. Each round DRAWS a little scene — an object
// placed on / in / under / in front of / behind / beside a box — and asks the
// learner which preposition names it. In EASY ("pick") mode a few word choices
// are offered; the learner taps the right one and the round marks itself. Like
// the other language games the rounds are re-derived from the widget's identity
// + `round` counter (a seeded shuffle), so every collaborator sees the SAME
// scenes; the response — the picked word per round and whether it's checked — is
// live widget-state (`pa:<i>` / `pc:<i>`), undo-invisible, synced and persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import { prepositionsFor, type LangPair, type PrepositionCue } from "@/lang/pairs";
import type { PrepPosition } from "@/lang/content/schema";

/** The shape the component reads: params plus live widget-state (pa:*, pc:*). */
export interface PrepObj {
  id: string;
  known: string;
  learning: string;
  rounds: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  round?: number;
  idx?: number;
  [field: string]: unknown; // pa:<i> -> the picked word; pc:<i> -> 1 checked
}

/** One round: the scene to draw, the answer word, and the word choices. */
export interface PrepRound {
  position: PrepPosition;
  /** The preposition in the learning language (the answer). */
  answer: string;
  /** Its translation in the known language, revealed after checking. */
  known: string;
  /** The object emoji placed relative to the box (varies for fun). */
  emoji: string;
  /** The word choices (learning language), including the answer. */
  options: string[];
}

/** The object emojis dropped into a scene — cycled for variety, never the box. */
const OBJECTS = ["🐱", "🐶", "⚽", "🍎", "🐭", "🧸", "🐦", "🚗"] as const;

export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 12;
export const DEFAULT_ROUNDS = 6;

export const clampRounds = (n: number | undefined): number =>
  Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.round(n ?? DEFAULT_ROUNDS)));

/** Compare answers leniently: case-, accent- and whitespace-insensitive. */
export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const pairOf = (obj: PrepObj): LangPair => ({ known: obj.known, learning: obj.learning });

/** The prepositions available for this widget's pair. */
export const cuesFor = (obj: PrepObj): PrepositionCue[] => prepositionsFor(pairOf(obj));

/** Derive the whole session deterministically from state. */
export function deriveDeck(obj: PrepObj): PrepRound[] {
  const round = obj.round ?? 0;
  const cues = cuesFor(obj);
  const rng = rngFromSeed(`${obj.id}:${round}:${obj.known}:${obj.learning}`);
  const want = Math.min(clampRounds(obj.rounds), cues.length);
  const chosen = shuffle(rng, cues).slice(0, want);
  // The full pool of learning words, for distractor options.
  const pool = cues.map((c) => c.learning);
  return chosen.map((cue) => {
    const distractors = shuffle(
      rng,
      pool.filter((w) => normalize(w) !== normalize(cue.learning)),
    ).slice(0, 3);
    const options = shuffle(rng, [cue.learning, ...distractors]);
    const emoji = OBJECTS[Math.floor(rng() * OBJECTS.length)];
    return { position: cue.position, answer: cue.learning, known: cue.known, emoji, options };
  });
}

export const deckLength = (obj: PrepObj): number => deriveDeck(obj).length;

// --- correctness ------------------------------------------------------------

export const isRoundCorrect = (round: PrepRound, answer: string): boolean =>
  normalize(answer) === normalize(round.answer);

// --- per-round response (the learner's live state) --------------------------

export const ANS_PREFIX = "pa:";
export const CHECK_PREFIX = "pc:";
export const ansField = (i: number): string => ANS_PREFIX + i;
export const checkField = (i: number): string => CHECK_PREFIX + i;

export function readAnswer(obj: PrepObj, i: number): string {
  const v = obj[ansField(i)];
  return typeof v === "string" ? v : "";
}
export const isChecked = (obj: PrepObj, i: number): boolean =>
  obj[checkField(i)] === 1 || obj[checkField(i)] === true;

export const setAnswerPatch = (i: number, v: string): Record<string, unknown> => ({
  [ansField(i)]: v === "" ? undefined : v,
});
export const checkPatch = (i: number): Record<string, unknown> => ({ [checkField(i)]: 1 });
export const retryPatch = (i: number): Record<string, unknown> => ({
  [ansField(i)]: undefined,
  [checkField(i)]: undefined,
});

export function pruneResponses(obj: PrepObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith(ANS_PREFIX) || k.startsWith(CHECK_PREFIX)) patch[k] = undefined;
  }
  return patch;
}

// --- summary ----------------------------------------------------------------

export interface ScoredPrep {
  round: PrepRound;
  answer: string;
  correct: boolean;
}

export function scoreDeck(obj: PrepObj, deck: PrepRound[]): ScoredPrep[] {
  return deck.map((round, i) => {
    const answer = readAnswer(obj, i);
    return { round, answer, correct: isChecked(obj, i) && isRoundCorrect(round, answer) };
  });
}
export const scoreCount = (scored: ScoredPrep[]): number =>
  scored.reduce((n, s) => n + (s.correct ? 1 : 0), 0);

export function verdict(correct: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- session control --------------------------------------------------------

export const nextPatch = (obj: PrepObj): Partial<PrepObj> => ({ idx: (obj.idx ?? 0) + 1 });
export const replayPatch = (obj: PrepObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
export const newDeckPatch = (obj: PrepObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  ...pruneResponses(obj),
});
export const resetSessionPatch = (obj: PrepObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
