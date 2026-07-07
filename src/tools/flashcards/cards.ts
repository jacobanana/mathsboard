// The Flash-cards game engine — pure, deterministic, no React.
//
// A flash-cards widget shows ONE arithmetic question at a time from a fixed
// deck. The deck is never stored: it is re-derived from the widget's identity
// and its `round` counter (id · round · mode · level · table · count) through a
// seeded RNG, so every collaborator computes the SAME deck with zero write
// races — exactly the trick the Money mat and the dice widget use to agree.
// Bumping `round` (the "New deck" button) reshuffles everywhere at once.
//
// The student's response is live widget-state: one `fa:<i>` field per card
// (the typed answer). The current position (`idx`) and whether the current card
// is turned to its answer side (`flipped`) are live state too. checkAnswer and
// the end-of-deck summary read straight off those fields, so the whole session
// syncs and persists but is undo-invisible — the same model as the worksheet's
// per-question answers.

import { answersMatch } from "@/tools/registry";

export type FlashMode = "times" | "add" | "sub" | "mul" | "div" | "mixed";
export type Level = "easy" | "medium" | "hard";

/** An arithmetic operator, shown verbatim on the card. */
export type Op = "+" | "−" | "×" | "÷";

/** One card: `a op b = ans`. */
export interface FlashCard {
  a: number;
  op: Op;
  b: number;
  ans: number;
}

/** The shape the component reads: params plus live widget-state (incl. fa:*). */
export interface FlashObj {
  id: string;
  mode: FlashMode;
  level: Level;
  /** How many cards in the deck. */
  count: number;
  /** Times mode: a fixed table (2..12), or 0 for a mix of tables. */
  table?: number;
  /** Per-card countdown, in seconds; 0 / undefined = no timer. */
  seconds?: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new deck" counter; the deck is re-derived from it. */
  round?: number;
  /** Current card index [0..count]; === count means "finished" (summary). */
  idx?: number;
  /** Is the current card turned to its answer side? */
  flipped?: boolean;
  [field: string]: unknown; // fa:<i> -> string (the typed answer)
}

export const MODES: FlashMode[] = ["times", "add", "sub", "mul", "div", "mixed"];
export const LEVELS: Level[] = ["easy", "medium", "hard"];

export const MODE_LABEL: Record<FlashMode, string> = {
  times: "Times table",
  add: "Addition",
  sub: "Subtraction",
  mul: "Multiplication",
  div: "Division",
  mixed: "Mixed operations",
};

export const LEVEL_LABEL: Record<Level, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Deck size bounds — enough cards for a session, few enough to summarise. */
export const MIN_COUNT = 4;
export const MAX_COUNT = 30;
export const DEFAULT_COUNT = 10;
/** Per-card timer bounds (seconds) when the optional timer is switched on. */
export const MIN_SECONDS = 3;
export const MAX_SECONDS = 120;

export const clampCount = (n: number | undefined): number =>
  Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(n ?? DEFAULT_COUNT)));

// --- seeded RNG (identical to the Money engine, so decks derive the same
//     everywhere with no Date/Math.random) ------------------------------------

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: () => number, arr: T[]): T =>
  arr[Math.floor(rng() * arr.length)];

// --- difficulty tuning ------------------------------------------------------
//
// One table drives every mode: `addMax` bounds +/−, `facLo..facHi` bounds the
// factors of ×/÷ (and division stays exact — the answer is a whole quotient),
// and `mulMax` bounds the multiplier in times mode.

interface Range {
  addMax: number;
  facLo: number;
  facHi: number;
  mulMax: number;
  /** Times mode with a MIX of tables: which tables are in the mix. */
  tblLo: number;
  tblHi: number;
}

const RANGES: Record<Level, Range> = {
  easy: { addMax: 10, facLo: 2, facHi: 5, mulMax: 6, tblLo: 2, tblHi: 5 },
  medium: { addMax: 50, facLo: 2, facHi: 10, mulMax: 10, tblLo: 2, tblHi: 10 },
  hard: { addMax: 100, facLo: 2, facHi: 12, mulMax: 12, tblLo: 2, tblHi: 12 },
};

const ADD = (rng: () => number, r: Range): FlashCard => {
  const a = randInt(rng, 1, r.addMax);
  const b = randInt(rng, 1, r.addMax);
  return { a, op: "+", b, ans: a + b };
};

const SUB = (rng: () => number, r: Range): FlashCard => {
  // b ≤ a keeps the answer whole and non-negative.
  const a = randInt(rng, 1, r.addMax);
  const b = randInt(rng, 0, a);
  return { a, op: "−", b, ans: a - b };
};

const MUL = (rng: () => number, r: Range): FlashCard => {
  const a = randInt(rng, r.facLo, r.facHi);
  const b = randInt(rng, r.facLo, r.facHi);
  return { a, op: "×", b, ans: a * b };
};

const DIV = (rng: () => number, r: Range): FlashCard => {
  // Build from an exact product so the division is clean (a ÷ b = q).
  const b = randInt(rng, r.facLo, r.facHi);
  const q = randInt(rng, r.facLo, r.facHi);
  return { a: b * q, op: "÷", b, ans: q };
};

const TIMES = (rng: () => number, r: Range, table: number): FlashCard => {
  const k = table > 0 ? table : randInt(rng, r.tblLo, r.tblHi);
  const a = randInt(rng, 1, r.mulMax);
  return { a, op: "×", b: k, ans: a * k };
};

function genCard(
  mode: FlashMode,
  r: Range,
  table: number,
  rng: () => number,
): FlashCard {
  switch (mode) {
    case "add":
      return ADD(rng, r);
    case "sub":
      return SUB(rng, r);
    case "mul":
      return MUL(rng, r);
    case "div":
      return DIV(rng, r);
    case "times":
      return TIMES(rng, r, table);
    case "mixed":
    default:
      return pick(rng, [ADD, SUB, MUL, DIV])(rng, r);
  }
}

const sameCard = (x: FlashCard, y: FlashCard): boolean =>
  x.a === y.a && x.op === y.op && x.b === y.b;

/** Derive a widget's deck deterministically from its state. */
export function deriveDeck(obj: FlashObj): FlashCard[] {
  const round = obj.round ?? 0;
  const table = obj.table ?? 0;
  const count = clampCount(obj.count);
  const r = RANGES[obj.level];
  const rng = mulberry32(
    hashStr(`${obj.id}:${round}:${obj.mode}:${obj.level}:${table}:${count}`),
  );
  const deck: FlashCard[] = [];
  for (let i = 0; i < count; i++) {
    let card = genCard(obj.mode, r, table, rng);
    // Avoid a back-to-back repeat (a few retries; not every case has enough
    // distinct cards — e.g. Easy division — so give up gracefully).
    for (let t = 0; t < 8 && i > 0 && sameCard(card, deck[i - 1]); t++) {
      card = genCard(obj.mode, r, table, rng);
    }
    deck.push(card);
  }
  return deck;
}

/** Header title for a config (mode + level, plus the table when fixed). */
export function deckTitle(obj: FlashObj): string {
  if (obj.mode === "times" && (obj.table ?? 0) > 0) {
    return `${obj.table}× table · ${LEVEL_LABEL[obj.level]}`;
  }
  return `${MODE_LABEL[obj.mode]} · ${LEVEL_LABEL[obj.level]}`;
}

/** How a card reads on its face, e.g. "3 × 7". */
export const cardText = (c: FlashCard): string => `${c.a} ${c.op} ${c.b}`;

// --- per-card answers (the student's live state) ----------------------------

export const FA_PREFIX = "fa:";
export const ansField = (i: number): string => FA_PREFIX + i;

/** The typed answer for card `i` (empty string when unanswered). */
export function readAnswer(obj: FlashObj, i: number): string {
  const v = obj[ansField(i)];
  return typeof v === "string" ? v : "";
}

/** A patch that removes every stored answer (New deck / Play again / edit). */
export function pruneAnswers(obj: FlashObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) if (k.startsWith(FA_PREFIX)) patch[k] = undefined;
  return patch;
}

/** Is `answer` right for `card`? A blank answer is never correct. */
export const isCorrect = (card: FlashCard, answer: string): boolean =>
  answer.trim() !== "" && answersMatch(answer, card.ans);

// --- the end-of-deck summary ------------------------------------------------

export interface Scored {
  card: FlashCard;
  answer: string;
  correct: boolean;
}

/** Score every card against its stored answer, in deck order. */
export function scoreDeck(obj: FlashObj, deck: FlashCard[]): Scored[] {
  return deck.map((card, i) => {
    const answer = readAnswer(obj, i);
    return { card, answer, correct: isCorrect(card, answer) };
  });
}

export const scoreCount = (scored: Scored[]): number =>
  scored.reduce((n, s) => n + (s.correct ? 1 : 0), 0);

/** A little end-of-deck message keyed to the percentage right. */
export function verdict(correct: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- session control (the exact patch each transition writes) ---------------

/** Turn the current card to its answer side (Check / timer expiry). */
export const flipPatch = (): Partial<FlashObj> => ({ flipped: true });

/** Advance to the next card (or to the summary past the last). */
export const nextPatch = (obj: FlashObj): Partial<FlashObj> => ({
  idx: (obj.idx ?? 0) + 1,
  flipped: false,
});

/** Restart the SAME deck from the first card (Play again). */
export const replayPatch = (obj: FlashObj): Record<string, unknown> => ({
  idx: 0,
  flipped: false,
  ...pruneAnswers(obj),
});

/** A fresh deck: new questions (bump round) from the first card (New deck). */
export const newDeckPatch = (obj: FlashObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  flipped: false,
  ...pruneAnswers(obj),
});

/** Reset the whole session after a settings edit (see resetOnEdit): start the
 *  (re-derived) deck from the top with no stale answers. */
export const resetSessionPatch = (obj: FlashObj): Record<string, unknown> => ({
  idx: 0,
  flipped: false,
  ...pruneAnswers(obj),
});
