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
  metricsFor,
  parseAmount,
  pieceSize,
  type CurrencyCode,
  type Currency,
  type Denomination,
  type Difficulty,
  type Metrics,
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
  /** Box size (px) — the mat pieces are laid out within. */
  w?: number;
  h?: number;
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
    inputMode: "build",
    prompt: (p) => {
      const cur = getCurrency(p.currency);
      return `It cost ${format(p.price ?? 0, cur)}, paid with ${format(
        p.paid ?? 0,
        cur,
      )} — give the change.`;
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

// --- layout: place pieces so each stays mostly visible ----------------------
//
// Positions are stored normalised [0..1] in mat space (so they survive resize),
// but crowding is judged in PIXELS via the shared metrics — a coin and a wide
// note need very different clearance. A piece may be at most MAX_OVERLAP covered
// by any other, so at least (1 − MAX_OVERLAP) of every piece stays visible.

/** Mat layout heights (also used by the component to size its rows). */
export const PROMPT_H = 40;
export const ANSWER_H = 48;
/** Tray chip footprint (px) — must match the .imoney-chip CSS. */
const CHIP_COIN_W = 46;
const CHIP_BILL_W = 60;
const CHIP_GAP = 6;
const TRAY_ROW_H = 52;
const TRAY_VPAD = 12;
const DEFAULT_W = 480;
const DEFAULT_H = 440;

/** How many rows the tray wraps into at a given widget width (greedy pack,
 *  matching flex-wrap) — the tray shows EVERY denomination, never scrolls. */
export function trayRows(obj: MoneyObj): number {
  const mode = GAME_META[obj.game].inputMode;
  if (mode !== "build" && mode !== "none") return 0;
  const denoms = denominationsFor(getCurrency(obj.currency), obj.difficulty);
  const avail = (obj.w ?? DEFAULT_W) - 2 * CHIP_GAP;
  let rows = 1;
  let rowW = 0;
  for (const d of denoms) {
    const cw = (d.kind === "coin" ? CHIP_COIN_W : CHIP_BILL_W) + CHIP_GAP;
    if (rowW > 0 && rowW + cw > avail) {
      rows++;
      rowW = 0;
    }
    rowW += cw;
  }
  return rows;
}

/** Total tray height (px), 0 when the game has no tray. */
export function trayHeight(obj: MoneyObj): number {
  const rows = trayRows(obj);
  return rows > 0 ? rows * TRAY_ROW_H + TRAY_VPAD : 0;
}

/** The mat (canvas stage) pixel size for a widget — the area pieces live in.
 *  Mirrors the component's layout so placement and drawing agree. */
export function stageSize(obj: MoneyObj): { w: number; h: number } {
  return {
    w: obj.w ?? DEFAULT_W,
    h: Math.max(60, (obj.h ?? DEFAULT_H) - PROMPT_H - ANSWER_H - trayHeight(obj)),
  };
}

/** At least 60% of every piece stays visible (≤40% of it may be covered). */
const MAX_OVERLAP = 0.4;

interface Box {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

function boxAt(d: Denomination, cx: number, cy: number, m: Metrics): Box {
  const { w, h } = pieceSize(d, m);
  return { cx, cy, hw: w / 2, hh: h / 2 };
}

/** Fraction of the SMALLER of two boxes covered by their overlap (0..1) — so a
 *  wide note dropped on a small coin (or vice-versa) reads as "the coin is
 *  hidden", not "a big shape barely overlaps". */
function coverFrac(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.cx + a.hw, b.cx + b.hw) - Math.max(a.cx - a.hw, b.cx - b.hw));
  const oy = Math.max(0, Math.min(a.cy + a.hh, b.cy + b.hh) - Math.max(a.cy - a.hh, b.cy - b.hh));
  const minArea = Math.min(4 * a.hw * a.hh, 4 * b.hw * b.hh);
  return minArea > 0 ? (ox * oy) / minArea : 0;
}

const spinFor = (rng: () => number, d: Denomination): number =>
  (rng() - 0.5) * (d.kind === "coin" ? 0.7 : 0.22);

/**
 * Place `list` in a pixel region, each piece kept ≤MAX_OVERLAP over any already
 * placed one (rejection sampling; best-effort when the mat is genuinely too
 * full). `seed` boxes (e.g. the other compare pile) are avoided but not
 * returned. Returns pieces with NORMALISED positions.
 */
function placePile(
  rng: () => number,
  list: Denomination[],
  region: [number, number, number, number],
  W: number,
  H: number,
  m: Metrics,
  keyPrefix: string,
  seed: Box[] = [],
): PlacedPiece[] {
  const placed = [...seed];
  const pieces: PlacedPiece[] = [];
  list.forEach((d, i) => {
    const half = boxAt(d, 0, 0, m);
    // Keep the whole piece inside both the region and the mat.
    const x0 = Math.max(half.hw, region[0]);
    const y0 = Math.max(half.hh, region[1]);
    const x1 = Math.min(W - half.hw, region[2]);
    const y1 = Math.min(H - half.hh, region[3]);
    let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    let bestCover = Infinity;
    for (let attempt = 0; attempt < 120; attempt++) {
      const cx = x1 > x0 ? x0 + rng() * (x1 - x0) : (x0 + x1) / 2;
      const cy = y1 > y0 ? y0 + rng() * (y1 - y0) : (y0 + y1) / 2;
      const box = boxAt(d, cx, cy, m);
      let cover = 0;
      for (const p of placed) {
        cover = Math.max(cover, coverFrac(box, p));
        if (cover > MAX_OVERLAP) break;
      }
      if (cover <= MAX_OVERLAP) {
        best = { x: cx, y: cy };
        break;
      }
      if (cover < bestCover) {
        bestCover = cover;
        best = { x: cx, y: cy };
      }
    }
    placed.push(boxAt(d, best.x, best.y, m));
    pieces.push({ key: `${keyPrefix}${i}`, denomId: d.id, x: best.x / W, y: best.y / H, spin: spinFor(rng, d) });
  });
  return pieces;
}

/** A spot for a newly placed piece that keeps it (and the pieces already on the
 *  mat) at least 60% visible. Returns a normalised position. */
export function freeSpot(
  existing: PlacedPiece[],
  newDenomId: string,
  obj: MoneyObj,
  rng: () => number,
): { x: number; y: number } {
  const d = getDenom(newDenomId);
  if (!d) return { x: 0.5, y: 0.5 };
  const cur = getCurrency(obj.currency);
  const { w: W, h: H } = stageSize(obj);
  const m = metricsFor(cur, Math.min(W, H));
  const seed = existing
    .map((p) => {
      const ed = getDenom(p.denomId);
      return ed ? boxAt(ed, p.x * W, p.y * H, m) : null;
    })
    .filter((b): b is Box => b !== null);
  const [piece] = placePile(rng, [d], [0.03 * W, 0.05 * H, 0.97 * W, 0.94 * H], W, H, m, "n", seed);
  return { x: piece.x, y: piece.y };
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
  const { w: W, h: H } = stageSize(obj);
  const m = metricsFor(cur, Math.min(W, H));
  const choose = (n: number) => Array.from({ length: n }, () => pick(rng, denoms));

  switch (obj.game) {
    case "count": {
      const pile = placePile(rng, choose(randInt(rng, r.nLo, r.nHi)), [0.03 * W, 0.05 * H, 0.97 * W, 0.95 * H], W, H, m, "q");
      return { game: "count", currency: obj.currency, presented: pile, target: sumPieces(pile) };
    }
    case "compare": {
      // Fewer pieces per pile than counting — two piles share the mat, and a
      // comparison reads best when each side is a small, countable handful.
      const cmpN = () => randInt(rng, 2, obj.difficulty === "hard" ? 5 : 4);
      const a = placePile(rng, choose(cmpN()), [0.03 * W, 0.05 * H, 0.49 * W, 0.95 * H], W, H, m, "a");
      const aBoxes = a.map((p) => boxAt(getDenom(p.denomId)!, p.x * W, p.y * H, m));
      // Occasionally force a tie so "=" is a real answer.
      const bList = rng() < 0.14 ? greedyPieces(sumPieces(a), denoms) ?? choose(cmpN()) : choose(cmpN());
      const b = placePile(rng, bList, [0.51 * W, 0.05 * H, 0.97 * W, 0.95 * H], W, H, m, "b", aBoxes);
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
      // The mat is the student's build area (they make the change with the
      // tray), so nothing is pre-placed — price & paid are stated in the prompt.
      const price = roundTo(randInt(rng, r.min, r.max), step);
      const paid = paidFor(price, denoms, cur, rng);
      return { game: "change", currency: obj.currency, presented: [], target: paid - price, price, paid };
    }
    case "sandbox":
    default:
      return { game: "sandbox", currency: obj.currency, presented: [], target: 0 };
  }
}

const sumPieces = (pieces: PlacedPiece[]): number =>
  pieces.reduce((s, p) => s + (getDenom(p.denomId)?.value ?? 0), 0);

/** A realistic, varied amount handed over for `price`: usually one of the two
 *  smallest single coins/notes bigger than the price (so the change stays
 *  sensible), or — if the price tops the biggest denomination — the next whole
 *  major unit up. Random pick gives the "give change" game its variety. */
function paidFor(
  price: number,
  denoms: Denomination[],
  cur: Currency,
  rng: () => number,
): number {
  const bigger = [...new Set(denoms.map((d) => d.value))]
    .filter((v) => v > price)
    .sort((a, b) => a - b);
  if (bigger.length) return pick(rng, bigger.slice(0, 2));
  return Math.ceil((price + 1) / cur.minorPerMajor) * cur.minorPerMajor;
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
    case "count": {
      const parsed = parseAns(obj.ans, getCurrency(obj.currency));
      return parsed === problem.target ? "ok" : "no";
    }
    case "make":
    case "shop":
    case "change":
      // Build games: the placed pile must total the target (change owed / price).
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
