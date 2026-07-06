// The Money tool's game engine — pure, deterministic, no React.
//
// One widget hosts six games (see MoneyGame). They share the SAME building
// blocks — a seeded problem, a pile of pieces, a running total, one answer
// check — and differ only in three things: the prompt line, the input mode, and
// the scoring branch. That is exactly the surface GAME_META + deriveProblem +
// checkAnswer expose, so the games are one engine, not six silos.
//
// A problem is never stored. It is re-derived from the widget's identity and its
// `round` counter (id · round · game · difficulty · currency) through a seeded
// RNG, so every collaborator computes the SAME problem with zero write races —
// the same trick the dice widget uses to agree on a starting face. Bumping
// `round` (the "New problem" button) is all it takes to reshuffle everywhere.
//
// The student's response lives as live widget-state: a typed `ans`, a compare
// `choice`, or a pile of placed pieces keyed `pc:<id>` (one CRDT field each, so
// two people building a pile both keep their coins). liveSum / checkAnswer read
// straight off that.

import {
  coinStep,
  denominationsFor,
  format,
  getCurrency,
  getDenom,
  greedyPieces,
  parseAmount,
  type CurrencyCode,
  type Currency,
  type Denomination,
  type Difficulty,
} from "@/tools/money/currencies";

export type MoneyGame =
  | "count"
  | "change"
  | "make"
  | "shop"
  | "compare"
  | "sandbox";

/** How the student answers — picks the input control the component renders. */
export type InputMode = "amount" | "build" | "choice" | "none";

export type Relation = ">" | "<" | "=";

/** The shape the component reads: params plus live widget-state (incl. pc:*). */
export interface MoneyObj {
  id: string;
  currency: CurrencyCode;
  game: MoneyGame;
  difficulty: Difficulty;
  round?: number;
  ans?: string;
  choice?: Relation;
  result?: "ok" | "no";
  [field: string]: unknown; // pc:<id> -> PlacedPieceData
}

/** A piece positioned on the mat. Positions are normalised [0..1] in mat space,
 *  so they survive a resize. */
export interface PlacedPiece {
  key: string;
  denomId: string;
  x: number;
  y: number;
  spin: number;
}

/** How a placed piece is stored in a `pc:<id>` field. */
export interface PlacedPieceData {
  d: string; // denomination id
  x: number;
  y: number;
  s: number; // spin
}

export interface Problem {
  game: MoneyGame;
  currency: CurrencyCode;
  /** The pile shown as the question (empty for make / shop / sandbox). */
  presented: PlacedPiece[];
  /** Second pile, for compare. */
  presentedB?: PlacedPiece[];
  /** The value the answer is checked against, in minor units:
   *  count → pile total · change → change owed · make → target · shop → price. */
  target: number;
  // Display extras (game-specific):
  price?: number;
  paid?: number;
  relation?: Relation;
  itemName?: string;
  itemEmoji?: string;
}

export const GAMES: MoneyGame[] = [
  "count",
  "change",
  "make",
  "shop",
  "compare",
  "sandbox",
];

export const GAME_META: Record<
  MoneyGame,
  { label: string; short: string; inputMode: InputMode; prompt: (p: Problem) => string }
> = {
  count: {
    label: "Count the money",
    short: "Count",
    inputMode: "amount",
    prompt: () => "How much money is here?",
  },
  change: {
    label: "Give change",
    short: "Change",
    inputMode: "amount",
    prompt: (p) => {
      const cur = getCurrency(p.currency);
      return `It cost ${format(p.price ?? 0, cur)}, you paid ${format(
        p.paid ?? 0,
        cur,
      )}. How much change?`;
    },
  },
  make: {
    label: "Make the amount",
    short: "Make",
    inputMode: "build",
    prompt: (p) => `Make ${format(p.target, getCurrency(p.currency))}`,
  },
  shop: {
    label: "Pay the price",
    short: "Shop",
    inputMode: "build",
    prompt: (p) =>
      `Pay exactly ${format(p.price ?? p.target, getCurrency(p.currency))}` +
      (p.itemName ? ` for the ${p.itemName}` : ""),
  },
  compare: {
    label: "Which is worth more?",
    short: "Compare",
    inputMode: "choice",
    prompt: () => "Which pile is worth more?",
  },
  sandbox: {
    label: "Free play",
    short: "Sandbox",
    inputMode: "none",
    prompt: () => "Add coins and notes — the total is shown below.",
  },
};

// --- seeded RNG -------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32 — a small deterministic PRNG (no Date/Math.random, so every
 *  client derives the identical problem from the same seed). */
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

const RANGES: Record<Difficulty, { min: number; max: number; nLo: number; nHi: number }> = {
  // easy: a small handful of coins, under one major unit
  easy: { min: 5, max: 99, nLo: 3, nHi: 5 },
  // medium: coins + small notes, up to ~20 major units
  medium: { min: 50, max: 2000, nLo: 4, nHi: 7 },
  // hard: everything, up to ~100 major units
  hard: { min: 100, max: 10000, nLo: 5, nHi: 10 },
};

const SHOP_ITEMS: [string, string][] = [
  ["apple", "🍎"],
  ["book", "📕"],
  ["ball", "⚽"],
  ["toy car", "🚗"],
  ["ice cream", "🍦"],
  ["pencil", "✏️"],
  ["cupcake", "🧁"],
  ["balloon", "🎈"],
  ["teddy", "🧸"],
  ["hat", "🎩"],
];

// --- layout (deterministic scatter within the mat, normalised [0..1]) -------

function scatter(
  rng: () => number,
  n: number,
  region: [number, number, number, number], // x0,y0,x1,y1
): { x: number; y: number }[] {
  const [x0, y0, x1, y1] = region;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0) });
  }
  return out;
}

/**
 * A spot for a newly placed piece that avoids crowding: sample a few candidates
 * and keep the one furthest from the existing pieces. Cosmetic only (the painter
 * z-sorts overlaps), so pixel-exact radii aren't needed.
 */
export function freeSpot(
  existing: { x: number; y: number }[],
  rng: () => number,
  region: [number, number, number, number] = [0.1, 0.12, 0.9, 0.74],
): { x: number; y: number } {
  const [x0, y0, x1, y1] = region;
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  let bestD = -1;
  for (let k = 0; k < 12; k++) {
    const c = { x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0) };
    let d = Infinity;
    for (const e of existing) d = Math.min(d, (e.x - c.x) ** 2 + (e.y - c.y) ** 2);
    if (existing.length === 0) return c;
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// --- pile builders ----------------------------------------------------------

const spinFor = (rng: () => number, d: Denomination): number =>
  (rng() - 0.5) * (d.kind === "coin" ? 0.7 : 0.28);

/** Build a pile of `n` random pieces from `denoms`, positioned in `region`. */
function buildPile(
  rng: () => number,
  denoms: Denomination[],
  n: number,
  region: [number, number, number, number],
  keyPrefix: string,
): PlacedPiece[] {
  const pos = scatter(rng, n, region);
  return pos.map((p, i) => {
    const d = pick(rng, denoms);
    return { key: `${keyPrefix}${i}`, denomId: d.id, x: p.x, y: p.y, spin: spinFor(rng, d) };
  });
}

/** Lay out an exact list of denominations (e.g. a greedy make) as a pile. */
function layoutPieces(
  rng: () => number,
  list: Denomination[],
  region: [number, number, number, number],
  keyPrefix: string,
): PlacedPiece[] {
  const pos = scatter(rng, list.length, region);
  return list.map((d, i) => ({
    key: `${keyPrefix}${i}`,
    denomId: d.id,
    x: pos[i].x,
    y: pos[i].y,
    spin: spinFor(rng, d),
  }));
}

const roundTo = (v: number, step: number): number =>
  Math.max(step, Math.round(v / step) * step);

// --- the problem ------------------------------------------------------------

/** Derive a game's problem deterministically from the widget's state. */
export function deriveProblem(obj: MoneyObj): Problem {
  const cur = getCurrency(obj.currency);
  const round = obj.round ?? 0;
  const rng = mulberry32(
    hashStr(`${obj.id}:${round}:${obj.game}:${obj.difficulty}:${obj.currency}`),
  );
  const denoms = denominationsFor(cur, obj.difficulty);
  const r = RANGES[obj.difficulty];
  const step = coinStep(cur);

  switch (obj.game) {
    case "count": {
      const n = randInt(rng, r.nLo, r.nHi);
      const pile = buildPile(rng, denoms, n, [0.1, 0.12, 0.9, 0.74], "q");
      return { game: "count", currency: obj.currency, presented: pile, target: sumPieces(pile) };
    }
    case "compare": {
      const a = buildPile(rng, denoms, randInt(rng, r.nLo, r.nHi), [0.06, 0.16, 0.44, 0.74], "a");
      let b = buildPile(rng, denoms, randInt(rng, r.nLo, r.nHi), [0.56, 0.16, 0.94, 0.74], "b");
      // Occasionally force a tie so "=" is a real answer.
      if (rng() < 0.12) b = retotal(rng, denoms, sumPieces(a), [0.56, 0.16, 0.94, 0.74], "b");
      const ta = sumPieces(a);
      const tb = sumPieces(b);
      const relation: Relation = ta > tb ? ">" : ta < tb ? "<" : "=";
      return { game: "compare", currency: obj.currency, presented: a, presentedB: b, target: ta, relation };
    }
    case "make": {
      const target = roundTo(randInt(rng, r.min, r.max), step);
      return { game: "make", currency: obj.currency, presented: [], target };
    }
    case "shop": {
      const price = roundTo(randInt(rng, r.min, r.max), step);
      const [itemName, itemEmoji] = pick(rng, SHOP_ITEMS);
      return { game: "shop", currency: obj.currency, presented: [], target: price, price, itemName, itemEmoji };
    }
    case "change": {
      const price = roundTo(randInt(rng, r.min, Math.max(r.min, r.max - 100)), step);
      const paid = nextPaid(price, denoms, step);
      const answer = paid - price;
      const pile = layoutPieces(rng, greedyPieces(paid, denoms) ?? [], [0.1, 0.12, 0.9, 0.68], "p");
      return { game: "change", currency: obj.currency, presented: pile, target: answer, price, paid };
    }
    case "sandbox":
    default:
      return { game: "sandbox", currency: obj.currency, presented: [], target: 0 };
  }
}

const sumPieces = (pieces: PlacedPiece[]): number =>
  pieces.reduce((s, p) => s + (getDenom(p.denomId)?.value ?? 0), 0);

/** Rebuild pile B to hit an exact total (for a forced compare tie), greedily. */
function retotal(
  rng: () => number,
  denoms: Denomination[],
  total: number,
  region: [number, number, number, number],
  keyPrefix: string,
): PlacedPiece[] {
  const list = greedyPieces(total, denoms);
  return list ? layoutPieces(rng, list, region, keyPrefix) : [];
}

/** A realistic "paid" amount ≥ price: the smallest single note/coin bigger than
 *  the price, else the price rounded up to the next major unit. */
function nextPaid(price: number, denoms: Denomination[], step: number): number {
  const bigger = denoms
    .map((d) => d.value)
    .filter((v) => v > price)
    .sort((a, b) => a - b);
  if (bigger.length) return bigger[0];
  const major = 100;
  return roundTo(Math.ceil((price + step) / major) * major, step);
}

// --- placed pieces (the student's pile) -------------------------------------

export const PC_PREFIX = "pc:";
export const placeField = (pieceId: string): string => PC_PREFIX + pieceId;

/** Read the student's placed pile off the object's `pc:*` fields. */
export function readPlacedPieces(obj: MoneyObj): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith(PC_PREFIX) || !v || typeof v !== "object") continue;
    const p = v as PlacedPieceData;
    if (typeof p.d !== "string") continue;
    out.push({ key: k.slice(PC_PREFIX.length), denomId: p.d, x: p.x, y: p.y, spin: p.s ?? 0 });
  }
  return out;
}

/** A patch that removes every placed piece (used on New problem / config change). */
export function prunePlacedPatch(obj: MoneyObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) if (k.startsWith(PC_PREFIX)) patch[k] = undefined;
  return patch;
}

/** Total value of a pile of pieces, in minor units. */
export const liveSum = (pieces: PlacedPiece[]): number => sumPieces(pieces);

// --- answer check -----------------------------------------------------------

/** Mark the current answer. Games with no answer to mark (sandbox) return "ok". */
export function checkAnswer(obj: MoneyObj, problem: Problem): "ok" | "no" {
  switch (obj.game) {
    case "count":
    case "change": {
      const cur = getCurrency(obj.currency);
      const parsed = parseAns(obj.ans, cur);
      return parsed === problem.target ? "ok" : "no";
    }
    case "make":
    case "shop":
      return liveSum(readPlacedPieces(obj)) === problem.target ? "ok" : "no";
    case "compare":
      return obj.choice != null && obj.choice === problem.relation ? "ok" : "no";
    case "sandbox":
    default:
      return "ok";
  }
}

const parseAns = (ans: string | undefined, cur: Currency): number | null =>
  ans == null ? null : parseAmount(ans, cur);

/** The config stamp a stored problem belongs to — when it stops matching params
 *  the component reseeds (a game / currency / difficulty change). */
export const problemStamp = (obj: MoneyObj): string =>
  `${obj.game}:${obj.difficulty}:${obj.currency}`;
