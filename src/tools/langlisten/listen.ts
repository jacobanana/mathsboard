// The "listen and choose" engine — pure, deterministic, no React.
//
// A widget runs a session of rounds. Each round SPEAKS one word in the learning
// language (text-to-speech) and offers a few options — shown as a picture and/or
// its meaning in the known language — for the learner to tap the one they heard.
// This is the board's one activity that trains LISTENING: the spoken word is the
// only clue; its spelling is never shown until after the answer. Like the other
// games the rounds are re-derived from the widget's identity + `round` counter (a
// seeded shuffle), so every collaborator hears the SAME words; the response — the
// picked word per round and whether it's checked — is live widget-state
// (`la:<i>` / `lc:<i>`), undo-invisible, synced and persisted.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  categoriesFromObj,
  categoriesLabel,
  vocabForCategories,
  type LangPair,
  type LevelFilter,
  type VocabPair,
} from "@/lang/pairs";

/** The shape the component reads: params plus live widget-state (la:*, lc:*). */
export interface ListenObj {
  id: string;
  known: string;
  learning: string;
  /** The themes drawn from. Older objects carry a single `category`. */
  categories?: string[];
  category?: string;
  topic?: string;
  level?: LevelFilter;
  rounds: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  round?: number;
  idx?: number;
  [field: string]: unknown; // la:<i> -> the picked learning word; lc:<i> -> 1 checked
}

/** One round: the spoken word (learning language) and the answer choices. The
 *  answer is the option whose `learning` equals the spoken word. */
export interface ListenRound {
  /** The word spoken aloud — the only clue, never shown until checked. */
  spoken: string;
  options: VocabPair[];
}

export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 12;
export const DEFAULT_ROUNDS = 6;
/** How many choices a round offers (the answer + up to this-many-1 distractors). */
export const OPTION_COUNT = 4;

export const clampRounds = (n: number | undefined): number =>
  Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.round(n ?? DEFAULT_ROUNDS)));

/** Compare answers leniently: case-, accent- and whitespace-insensitive. */
export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const pairOf = (obj: ListenObj): LangPair => ({ known: obj.known, learning: obj.learning });
export const categoriesOf = (obj: ListenObj): string[] => categoriesFromObj(obj);
export const levelOf = (obj: ListenObj): LevelFilter => obj.level ?? "mixed";

/** Derive the whole session deterministically from state. */
export function deriveDeck(obj: ListenObj): ListenRound[] {
  const round = obj.round ?? 0;
  const pool = vocabForCategories(categoriesOf(obj), levelOf(obj), pairOf(obj));
  const rng = rngFromSeed(
    `${obj.id}:${round}:${categoriesOf(obj).join(",")}:${levelOf(obj)}:${obj.known}:${obj.learning}`,
  );
  const want = Math.min(clampRounds(obj.rounds), pool.length);
  const targets = shuffle(rng, pool).slice(0, want);
  return targets.map((target) => {
    const distractors = shuffle(
      rng,
      pool.filter((v) => normalize(v.learning) !== normalize(target.learning)),
    ).slice(0, OPTION_COUNT - 1);
    const options = shuffle(rng, [target, ...distractors]);
    return { spoken: target.learning, options };
  });
}

export const deckLength = (obj: ListenObj): number => deriveDeck(obj).length;

export function deckTitle(obj: ListenObj): string {
  return categoriesLabel(categoriesOf(obj), "Listen & choose");
}

/** The option that is the correct answer for a round (matches the spoken word). */
export function answerOption(round: ListenRound): VocabPair | undefined {
  return round.options.find((o) => normalize(o.learning) === normalize(round.spoken));
}

// --- correctness ------------------------------------------------------------

export const isRoundCorrect = (round: ListenRound, answer: string): boolean =>
  normalize(answer) === normalize(round.spoken);

// --- per-round response (the learner's live state) --------------------------

export const ANS_PREFIX = "la:";
export const CHECK_PREFIX = "lc:";
export const ansField = (i: number): string => ANS_PREFIX + i;
export const checkField = (i: number): string => CHECK_PREFIX + i;

export function readAnswer(obj: ListenObj, i: number): string {
  const v = obj[ansField(i)];
  return typeof v === "string" ? v : "";
}
export const isChecked = (obj: ListenObj, i: number): boolean =>
  obj[checkField(i)] === 1 || obj[checkField(i)] === true;

export const setAnswerPatch = (i: number, v: string): Record<string, unknown> => ({
  [ansField(i)]: v === "" ? undefined : v,
});
export const checkPatch = (i: number): Record<string, unknown> => ({ [checkField(i)]: 1 });
export const retryPatch = (i: number): Record<string, unknown> => ({
  [ansField(i)]: undefined,
  [checkField(i)]: undefined,
});

export function pruneResponses(obj: ListenObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith(ANS_PREFIX) || k.startsWith(CHECK_PREFIX)) patch[k] = undefined;
  }
  return patch;
}

// --- summary ----------------------------------------------------------------

export interface ScoredListen {
  round: ListenRound;
  answer: string;
  correct: boolean;
}

export function scoreDeck(obj: ListenObj, deck: ListenRound[]): ScoredListen[] {
  return deck.map((round, i) => {
    const answer = readAnswer(obj, i);
    return { round, answer, correct: isChecked(obj, i) && isRoundCorrect(round, answer) };
  });
}
export const scoreCount = (scored: ScoredListen[]): number =>
  scored.reduce((n, s) => n + (s.correct ? 1 : 0), 0);

export function verdict(correct: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- session control --------------------------------------------------------

export const nextPatch = (obj: ListenObj): Partial<ListenObj> => ({ idx: (obj.idx ?? 0) + 1 });
export const replayPatch = (obj: ListenObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
export const newDeckPatch = (obj: ListenObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  ...pruneResponses(obj),
});
export const resetSessionPatch = (obj: ListenObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
