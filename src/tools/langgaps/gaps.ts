// The fill-the-gaps engine — pure, deterministic, no React.
//
// A widget runs a session of "fill in the missing word" puzzles, ONE sentence
// per round, from the SAME sentence database as the other sentence games. Each
// round shows a sentence in the learning language with one word blanked out (and
// the known-language sentence as a hint); the learner supplies the missing word.
// In EASY mode a few word choices are offered to tap; in HARD mode the learner
// types it. Like the sentence builder the rounds are re-derived from the widget's
// identity + `round` counter (seeded shuffles); the response — the picked/typed
// word per round and whether it's been checked — is live widget-state
// (`ga:<i>` / `gc:<i>`), undo-invisible, synced and persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import { sentencesFor, type LangPair, type LevelFilter } from "@/lang/pairs";
import { categoryById } from "@/lang/data";

export type Difficulty = "pick" | "type";

/** The shape the component reads: params plus live widget-state (ga:*, gc:*). */
export interface GapObj {
  id: string;
  known: string;
  learning: string;
  category: string;
  level?: LevelFilter;
  difficulty: Difficulty;
  rounds: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  round?: number;
  idx?: number;
  [field: string]: unknown; // ga:<i> -> the answer string; gc:<i> -> 1 checked
}

/** One round: the prompt (known sentence), the learning-language tokens with a
 *  gap, the answer word, and (easy mode) the word choices. */
export interface GapRound {
  prompt: string;
  tokens: string[];
  gapIndex: number;
  answer: string;
  options: string[];
}

export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 12;
export const DEFAULT_ROUNDS = 6;

export const clampRounds = (n: number | undefined): number =>
  Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.round(n ?? DEFAULT_ROUNDS)));

export const tokenize = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);

/** A token stripped of leading/trailing punctuation ("noir." → "noir"). */
export const core = (token: string): string =>
  token.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, "");

/** Leading / trailing punctuation around a token's core, for rendering the gap
 *  ("va ?" keeps its "?", "table." keeps its "."). */
export function affixes(token: string): { lead: string; trail: string } {
  const c = core(token);
  const at = token.indexOf(c);
  return { lead: c ? token.slice(0, at) : "", trail: c ? token.slice(at + c.length) : token };
}

/** Compare answers leniently: case-insensitive, trimmed, accent-insensitive — so
 *  a young typist isn't tripped by "etre" vs "être". */
export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const pairOf = (obj: GapObj): LangPair => ({ known: obj.known, learning: obj.learning });
export const categoryOf = (obj: GapObj): string => obj.category ?? "";
export const levelOf = (obj: GapObj): LevelFilter => obj.level ?? "mixed";

/** Derive the whole session deterministically from state. */
export function deriveDeck(obj: GapObj): GapRound[] {
  const round = obj.round ?? 0;
  const sentences = sentencesFor(categoryOf(obj), levelOf(obj), pairOf(obj));
  const rng = rngFromSeed(
    `${obj.id}:${round}:${categoryOf(obj)}:${levelOf(obj)}:${obj.known}:${obj.learning}`,
  );
  const want = Math.min(clampRounds(obj.rounds), sentences.length);
  const chosen = shuffle(rng, sentences).slice(0, want);
  // A pool of candidate distractor words from all the chosen sentences, deduped
  // by their normalized form so options never repeat ("Le" vs "le").
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const w of chosen.flatMap((s) => tokenize(s.learning).map(core))) {
    if (w.length < 2) continue;
    const n = normalize(w);
    if (seen.has(n)) continue;
    seen.add(n);
    pool.push(w);
  }
  return chosen.map((s) => {
    const tokens = tokenize(s.learning);
    // Blank a "real" word (2+ letters); fall back to the first token.
    const eligible = tokens
      .map((t, i) => ({ i, c: core(t) }))
      .filter((x) => x.c.length >= 2);
    const chosenGap = eligible.length
      ? eligible[Math.floor(rng() * eligible.length)]
      : { i: 0, c: core(tokens[0] ?? "") };
    const answer = chosenGap.c;
    const distractors = shuffle(rng, pool.filter((w) => normalize(w) !== normalize(answer))).slice(0, 3);
    const options = shuffle(rng, [answer, ...distractors]);
    return { prompt: s.known, tokens, gapIndex: chosenGap.i, answer, options };
  });
}

export const deckLength = (obj: GapObj): number => deriveDeck(obj).length;

export function deckTitle(obj: GapObj): string {
  const cat = categoryById(categoryOf(obj));
  return cat ? cat.label : "Fill the gaps";
}

// --- correctness ------------------------------------------------------------

export const isRoundCorrect = (round: GapRound, answer: string): boolean =>
  normalize(answer) === normalize(round.answer);

// --- per-round response (the learner's live state) --------------------------

export const ANS_PREFIX = "ga:";
export const CHECK_PREFIX = "gc:";
export const ansField = (i: number): string => ANS_PREFIX + i;
export const checkField = (i: number): string => CHECK_PREFIX + i;

export function readAnswer(obj: GapObj, i: number): string {
  const v = obj[ansField(i)];
  return typeof v === "string" ? v : "";
}
export const isChecked = (obj: GapObj, i: number): boolean =>
  obj[checkField(i)] === 1 || obj[checkField(i)] === true;

export const setAnswerPatch = (i: number, v: string): Record<string, unknown> => ({
  [ansField(i)]: v === "" ? undefined : v,
});
export const checkPatch = (i: number): Record<string, unknown> => ({ [checkField(i)]: 1 });
export const retryPatch = (i: number): Record<string, unknown> => ({
  [ansField(i)]: undefined,
  [checkField(i)]: undefined,
});

export function pruneResponses(obj: GapObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith(ANS_PREFIX) || k.startsWith(CHECK_PREFIX)) patch[k] = undefined;
  }
  return patch;
}

// --- summary ----------------------------------------------------------------

export interface ScoredGap {
  round: GapRound;
  answer: string;
  correct: boolean;
}

export function scoreDeck(obj: GapObj, deck: GapRound[]): ScoredGap[] {
  return deck.map((round, i) => {
    const answer = readAnswer(obj, i);
    return { round, answer, correct: isChecked(obj, i) && isRoundCorrect(round, answer) };
  });
}
export const scoreCount = (scored: ScoredGap[]): number =>
  scored.reduce((n, s) => n + (s.correct ? 1 : 0), 0);

export function verdict(correct: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- session control --------------------------------------------------------

export const nextPatch = (obj: GapObj): Partial<GapObj> => ({ idx: (obj.idx ?? 0) + 1 });
export const replayPatch = (obj: GapObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
export const newDeckPatch = (obj: GapObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  ...pruneResponses(obj),
});
export const resetSessionPatch = (obj: GapObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
