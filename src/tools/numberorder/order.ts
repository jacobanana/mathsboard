// The Number-order game engine — pure, deterministic, no React.
//
// A number-order widget runs a whole session of ordering puzzles, ONE round at
// a time. Like the Flash-cards deck, the rounds are never stored: they are
// re-derived from the widget's identity and its `round` counter
// (id · round · mode · target · level · count · rounds) through a seeded RNG, so
// every collaborator computes the SAME puzzles with zero write races — the same
// trick the Money mat, the dice and the flash cards use. Bumping `round` (the
// "New" button) reshuffles the whole session everywhere at once.
//
// The student's response is live widget-state: per round a `no:<i>` field (the
// ordered CHAIN of tapped tiles, as an index list) and an `nc:<i>` flag (has the
// round been checked/locked). scoring and the end-of-session summary read
// straight off those fields, so the whole game syncs and persists but stays
// undo-invisible — exactly the model the worksheet and flash cards use.

/** Tap ONE number (the biggest / smallest), or SORT them all into an order. */
export type NoMode = "pick" | "sort";

/** What the teacher asks for; "mix" randomises the goal round by round.
 *  In `pick`: biggest / smallest. In `sort`: smallest-first / biggest-first. */
export type NoTarget = "biggest" | "smallest" | "mix";

/** Number magnitude — controls the range the numbers are drawn from. */
export type Level = "easy" | "medium" | "hard";

/** The concrete goal resolved for a single round. `pick` rounds resolve to
 *  biggest/smallest; `sort` rounds to increasing/decreasing. */
export type RoundGoal = "biggest" | "smallest" | "increasing" | "decreasing";

/** One round: a set of numbers (in display order) and what to do with them. */
export interface OrderRound {
  /** The numbers shown, in the shuffled order they appear on the tiles. */
  nums: number[];
  goal: RoundGoal;
}

/** The shape the component reads: params plus live widget-state (no:*, nc:*). */
export interface OrderObj {
  id: string;
  mode: NoMode;
  target: NoTarget;
  level: Level;
  /** How many numbers per round. */
  count: number;
  /** How many rounds in a session. */
  rounds: number;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new game" counter; the whole session is re-derived from it. */
  round?: number;
  /** Current round index [0..rounds]; === rounds means "finished" (summary). */
  idx?: number;
  // no:<i> -> string, the chain of tapped tile indices ("2,0,1").
  // nc:<i> -> 1 when round i has been checked (locked, showing its result).
  [field: string]: unknown;
}

export const MODES: NoMode[] = ["pick", "sort"];
export const TARGETS: NoTarget[] = ["biggest", "smallest", "mix"];
export const LEVELS: Level[] = ["easy", "medium", "hard"];

export const MODE_LABEL: Record<NoMode, string> = {
  pick: "Tap one",
  sort: "Put in order",
};

/** Target labels DEPEND on the mode (biggest vs smallest-first), so the dialog
 *  asks the right question for the chosen task. */
export const TARGET_LABEL: Record<NoMode, Record<NoTarget, string>> = {
  pick: { biggest: "Biggest", smallest: "Smallest", mix: "Mix" },
  sort: { biggest: "Biggest first", smallest: "Smallest first", mix: "Mix" },
};

export const LEVEL_LABEL: Record<Level, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

// --- session bounds ---------------------------------------------------------

/** Numbers per round — two to compare, up to a small sortable set. */
export const MIN_NUMS = 2;
export const MAX_NUMS = 6;
export const DEFAULT_NUMS = 3;
/** Rounds per session — enough to practise, few enough to summarise. */
export const MIN_ROUNDS = 4;
export const MAX_ROUNDS = 20;
export const DEFAULT_ROUNDS = 8;

export const clampNums = (n: number | undefined): number =>
  Math.max(MIN_NUMS, Math.min(MAX_NUMS, Math.round(n ?? DEFAULT_NUMS)));
export const clampRounds = (n: number | undefined): number =>
  Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.round(n ?? DEFAULT_ROUNDS)));

// --- seeded RNG (identical to the Flash-cards / Money engine, so puzzles
//     derive the same everywhere with no Date/Math.random) ------------------

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

/** In-place Fisher–Yates using the seeded rng. */
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- difficulty tuning ------------------------------------------------------
//
// The level bounds the range the distinct numbers are drawn from. A wider range
// at higher levels makes the comparisons less obvious (and the digits longer).

const RANGE: Record<Level, { lo: number; hi: number }> = {
  easy: { lo: 1, hi: 100 },
  // Medium reaches into the thousands — four-digit numbers.
  medium: { lo: 1, hi: 9_999 },
  // Hard reaches into the millions — seven-digit numbers to compare and order.
  hard: { lo: 1, hi: 9_999_999 },
};

/** Numbers read with thousands separators so the big ones stay legible
 *  ("9,999,999"). Below 1000 this is a no-op ("20" stays "20"). Manual grouping
 *  keeps it deterministic and locale-free. */
export const formatNum = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `k` DISTINCT numbers from [lo, hi] (distinct so the order is unambiguous and
 *  the biggest / smallest are unique). */
function distinctNums(rng: () => number, lo: number, hi: number, k: number): number[] {
  const span = hi - lo + 1;
  const want = Math.min(k, span); // never ask for more than the range holds
  const seen = new Set<number>();
  let guard = 0;
  while (seen.size < want && guard++ < 2000) seen.add(randInt(rng, lo, hi));
  return [...seen];
}

/** Resolve the concrete goal for a round from the mode + target (mix → random). */
function roundGoal(mode: NoMode, target: NoTarget, rng: () => number): RoundGoal {
  if (mode === "pick") {
    if (target === "biggest") return "biggest";
    if (target === "smallest") return "smallest";
    return rng() < 0.5 ? "biggest" : "smallest";
  }
  if (target === "biggest") return "decreasing"; // biggest first
  if (target === "smallest") return "increasing"; // smallest first
  return rng() < 0.5 ? "increasing" : "decreasing";
}

/** True when a goal is a single-tap "spot the number" round. */
export const isPickGoal = (g: RoundGoal): boolean =>
  g === "biggest" || g === "smallest";

/** Is a display order already fully sorted the way the goal asks? (Used to
 *  avoid dealing a sort round that is trivially already in order.) */
function alreadySorted(nums: number[], goal: RoundGoal): boolean {
  for (let i = 1; i < nums.length; i++) {
    if (goal === "increasing" && nums[i - 1] >= nums[i]) return false;
    if (goal === "decreasing" && nums[i - 1] <= nums[i]) return false;
  }
  return true;
}

/** Derive a widget's whole session (its rounds) deterministically from state. */
export function deriveDeck(obj: OrderObj): OrderRound[] {
  const round = obj.round ?? 0;
  const count = clampNums(obj.count);
  const rounds = clampRounds(obj.rounds);
  const { lo, hi } = RANGE[obj.level];
  const rng = mulberry32(
    hashStr(`${obj.id}:${round}:${obj.mode}:${obj.target}:${obj.level}:${count}:${rounds}`),
  );
  const deck: OrderRound[] = [];
  for (let i = 0; i < rounds; i++) {
    const goal = roundGoal(obj.mode, obj.target, rng);
    let nums = shuffle(rng, distinctNums(rng, lo, hi, count));
    // For a sort round, reshuffle a couple of times if it landed already
    // ordered — the puzzle should never be pre-solved on deal.
    for (let t = 0; t < 4 && !isPickGoal(goal) && alreadySorted(nums, goal); t++) {
      nums = shuffle(rng, nums);
    }
    deck.push({ nums, goal });
  }
  return deck;
}

/** Header title for a config (task + level). */
export function deckTitle(obj: OrderObj): string {
  return `${MODE_LABEL[obj.mode]} · ${LEVEL_LABEL[obj.level]}`;
}

/** The instruction shown above the tiles for a round. */
export function goalPrompt(goal: RoundGoal): string {
  switch (goal) {
    case "biggest":
      return "Tap the biggest";
    case "smallest":
      return "Tap the smallest";
    case "increasing":
      return "Tap smallest → biggest";
    case "decreasing":
      return "Tap biggest → smallest";
  }
}

// --- correctness ------------------------------------------------------------

/** The display index of the single correct tile in a `pick` round. */
export function pickIndex(round: OrderRound): number {
  let best = 0;
  for (let i = 1; i < round.nums.length; i++) {
    if (round.goal === "biggest" ? round.nums[i] > round.nums[best] : round.nums[i] < round.nums[best]) {
      best = i;
    }
  }
  return best;
}

/** The required chain (display indices in the order they should be tapped) for
 *  a `sort` round. Numbers are distinct, so the order is unique. */
export function sortOrder(round: OrderRound): number[] {
  const idx = round.nums.map((_, i) => i);
  idx.sort((a, b) =>
    round.goal === "increasing" ? round.nums[a] - round.nums[b] : round.nums[b] - round.nums[a],
  );
  return idx;
}

/** Is `chain` a correct, complete answer for `round`? */
export function roundCorrect(round: OrderRound, chain: number[]): boolean {
  if (isPickGoal(round.goal)) return chain.length >= 1 && chain[0] === pickIndex(round);
  const want = sortOrder(round);
  return chain.length === want.length && chain.every((v, i) => v === want[i]);
}

// --- the tap interaction (pure) ---------------------------------------------

/** What a tap produces: the new chain, whether the round is now locked, and —
 *  when it just locked — whether the answer was right. */
export interface TapOutcome {
  chain: number[];
  checked: boolean;
  justChecked: boolean;
  correct: boolean;
}

/**
 * Apply a tap on tile `j` to a round. Returns null when the round is already
 * checked (locked). A `pick` round locks on the first tap. A `sort` round adds
 * `j` to the chain — or REMOVES it when it is already in the chain, the
 * "tap again to take it back out" correction — and locks once the chain holds
 * every tile.
 */
export function applyTap(
  round: OrderRound,
  chain: number[],
  checked: boolean,
  j: number,
): TapOutcome | null {
  if (checked) return null;
  if (isPickGoal(round.goal)) {
    return { chain: [j], checked: true, justChecked: true, correct: j === pickIndex(round) };
  }
  const next = chain.includes(j) ? chain.filter((x) => x !== j) : [...chain, j];
  if (next.length === round.nums.length) {
    return { chain: next, checked: true, justChecked: true, correct: roundCorrect(round, next) };
  }
  return { chain: next, checked: false, justChecked: false, correct: false };
}

// --- per-round response (the student's live state) --------------------------

export const CHAIN_PREFIX = "no:";
export const CHECK_PREFIX = "nc:";
export const chainField = (i: number): string => CHAIN_PREFIX + i;
export const checkField = (i: number): string => CHECK_PREFIX + i;

/** The tapped chain for round `i` (empty array when nothing tapped). */
export function readChain(obj: OrderObj, i: number): number[] {
  const v = obj[chainField(i)];
  if (typeof v !== "string" || v === "") return [];
  return v
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}

/** Serialise a chain for storage. */
export const writeChain = (chain: number[]): string => chain.join(",");

/** Has round `i` been checked (locked, showing its result)? */
export const isChecked = (obj: OrderObj, i: number): boolean =>
  obj[checkField(i)] === 1 || obj[checkField(i)] === true;

/** The widget-state patch a tap outcome writes for round `i`. */
export function tapStatePatch(i: number, out: TapOutcome): Record<string, unknown> {
  return {
    [chainField(i)]: out.chain.length ? writeChain(out.chain) : undefined,
    [checkField(i)]: out.checked ? 1 : undefined,
  };
}

/** Clear a single round back to untouched (the "Try again" / "Clear" button). */
export function retryPatch(i: number): Record<string, unknown> {
  return { [chainField(i)]: undefined, [checkField(i)]: undefined };
}

/** A patch that removes EVERY stored response (New / Play again / edit). */
export function pruneResponses(obj: OrderObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith(CHAIN_PREFIX) || k.startsWith(CHECK_PREFIX)) patch[k] = undefined;
  }
  return patch;
}

// --- the end-of-session summary ---------------------------------------------

export interface ScoredRound {
  round: OrderRound;
  chain: number[];
  correct: boolean;
}

/** Score every round against its stored chain, in order. */
export function scoreDeck(obj: OrderObj, deck: OrderRound[]): ScoredRound[] {
  return deck.map((round, i) => {
    const chain = readChain(obj, i);
    return { round, chain, correct: isChecked(obj, i) && roundCorrect(round, chain) };
  });
}

export const scoreCount = (scored: ScoredRound[]): number =>
  scored.reduce((n, s) => n + (s.correct ? 1 : 0), 0);

/** A little end-of-session message keyed to the percentage right. */
export function verdict(correct: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

/** How a round reads back on the summary, e.g. "2, 9, 5". */
export const roundText = (round: OrderRound): string =>
  round.nums.map(formatNum).join(", ");

// --- session control (the exact patch each transition writes) ---------------

/** Advance to the next round (or to the summary past the last). */
export const nextPatch = (obj: OrderObj): Partial<OrderObj> => ({
  idx: (obj.idx ?? 0) + 1,
});

/** Restart the SAME session from the first round (Play again). */
export const replayPatch = (obj: OrderObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});

/** A fresh session: new puzzles (bump round) from the first (New). */
export const newDeckPatch = (obj: OrderObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  ...pruneResponses(obj),
});

/** Reset the whole session after a settings edit (see resetOnEdit): start the
 *  (re-derived) session from the top with no stale responses. */
export const resetSessionPatch = (obj: OrderObj): Record<string, unknown> => ({
  idx: 0,
  ...pruneResponses(obj),
});
