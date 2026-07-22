// The vocabulary flash-cards engine — pure, deterministic, no React.
//
// One widget runs a whole study session: a deck of word cards from a topic,
// shown ONE at a time. Like the maths flash cards, the deck is never stored — it
// is re-derived from the widget's identity and its `round` counter through a
// seeded shuffle (see rng.ts), so every collaborator sees the SAME order with no
// write races. Bumping `round` ("New deck") reshuffles everywhere at once.
//
// A card shows a word in one language; the learner thinks of the translation,
// flips to check, and taps "Knew it" or "Practise". That self-rating is live
// widget-state (one `fk:<i>` field per card) plus the position (`idx`) and flip
// (`flipped`), exactly the undo-invisible, synced, persisted model the maths
// widgets use.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  categoriesOf as resolveCategories,
  vocabFor,
  type LangPair,
  type LevelFilter,
  type VocabPair,
} from "@/lang/pairs";
import { categoriesLabel } from "@/lang/data";

/** Which face shows first: the known word (produce the new language) or the
 *  learning word (recognise it). */
export type Direction = "known-first" | "learning-first";

export const DIRECTIONS: Direction[] = ["known-first", "learning-first"];

/** A learner-authored word pair (from the "My words" table). */
export interface CustomPair {
  known: string;
  learning: string;
}

/** The shape the component reads: params plus live widget-state (fk:*). */
export interface LangFlashObj {
  id: string;
  known: string;
  learning: string;
  /** The chosen themes (category ids). Legacy objects carry `category`/`topic`. */
  categories?: string[];
  category?: string;
  topic?: string;
  /** Difficulty filter; absent = "mixed" (all levels). */
  level?: LevelFilter;
  count: number;
  direction: Direction;
  /** Show the picture cue on each card ("easy" mode); false = words only. */
  easy?: boolean;
  /** When present, the deck is the learner's OWN words (from the My words
   *  table) instead of a preset topic — `topic` is then ignored. */
  custom?: CustomPair[];
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new deck" counter; the deck is re-derived from it. */
  round?: number;
  /** Current card index [0..count]; === count means "finished" (summary). */
  idx?: number;
  /** Is the current card turned to its answer side? */
  flipped?: boolean;
  [field: string]: unknown; // fk:<i> -> 1 when the learner rated it "knew it"
}

/** A dealt card: the prompt (front) and the answer (back), plus its emoji. */
export interface LangCard {
  front: string;
  back: string;
  emoji?: string;
}

// --- deck size bounds -------------------------------------------------------
export const MIN_COUNT = 4;
export const MAX_COUNT = 20;
export const DEFAULT_COUNT = 10;

export const clampCount = (n: number | undefined): number =>
  Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(n ?? DEFAULT_COUNT)));

const pairOf = (obj: LangFlashObj): LangPair => ({
  known: obj.known,
  learning: obj.learning,
});

/** The selected theme ids (new `categories`, or a legacy single key). */
export const categoriesOf = (obj: LangFlashObj): string[] => resolveCategories(obj);
/** The level filter (absent = every level). */
export const levelOf = (obj: LangFlashObj): LevelFilter => obj.level ?? "mixed";

/** Orient a resolved vocab pair onto a card per the chosen direction. */
function toCard(v: VocabPair, dir: Direction): LangCard {
  return dir === "known-first"
    ? { front: v.known, back: v.learning, emoji: v.emoji }
    : { front: v.learning, back: v.known, emoji: v.emoji };
}

/** True when this widget runs on the learner's own words rather than a topic. */
export const isCustom = (obj: LangFlashObj): boolean =>
  Array.isArray(obj.custom) && obj.custom.length > 0;

/** The pairs a widget draws from: the learner's own words, or a topic's set. */
function sourcePairs(obj: LangFlashObj): VocabPair[] {
  if (isCustom(obj)) {
    return obj.custom!
      .filter((p) => p.known?.trim() && p.learning?.trim())
      .map((p) => ({ known: p.known.trim(), learning: p.learning.trim() }));
  }
  return vocabFor(categoriesOf(obj), levelOf(obj), pairOf(obj));
}

/** Derive a widget's deck deterministically from its state. Shuffles the source
 *  pairs by seed and takes up to `count` of them (a source may hold fewer than
 *  the requested count — the deck is then simply as long as the source). */
export function deriveDeck(obj: LangFlashObj): LangCard[] {
  const round = obj.round ?? 0;
  const pairs = sourcePairs(obj);
  // Direction is deliberately NOT in the seed: it only orients each card
  // (front/back), so flipping it keeps the SAME deck order and simply turns the
  // cards over — it never reshuffles the words.
  const key = isCustom(obj)
    ? `custom:${pairs.length}`
    : `${categoriesOf(obj).join(",")}:${levelOf(obj)}`;
  const rng = rngFromSeed(`${obj.id}:${round}:${key}:${obj.known}:${obj.learning}`);
  // Custom decks use every word the learner typed (bounded by MAX); preset
  // topics honour the chosen count.
  const want = isCustom(obj)
    ? Math.min(pairs.length, MAX_COUNT)
    : Math.min(clampCount(obj.count), pairs.length);
  return shuffle(rng, pairs)
    .slice(0, want)
    .map((v) => toCard(v, obj.direction));
}

/** The effective card count for a widget (bounded by the source size). */
export const deckLength = (obj: LangFlashObj): number => deriveDeck(obj).length;

/** Header title, e.g. "Colours" — or "My words" for a learner's own deck. */
export function deckTitle(obj: LangFlashObj): string {
  if (isCustom(obj)) return "My words";
  return categoriesLabel(categoriesOf(obj), "Vocabulary");
}

// --- self-rating (the learner's live state) ---------------------------------

export const KNEW_PREFIX = "fk:";
export const knewField = (i: number): string => KNEW_PREFIX + i;

/** Did the learner rate card `i` as "knew it"? */
export const knewIt = (obj: LangFlashObj, i: number): boolean =>
  obj[knewField(i)] === 1 || obj[knewField(i)] === true;

/** A patch removing every self-rating (New deck / Play again / edit). */
export function pruneRatings(obj: LangFlashObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) if (k.startsWith(KNEW_PREFIX)) patch[k] = undefined;
  return patch;
}

// --- summary ----------------------------------------------------------------

export interface ScoredCard {
  card: LangCard;
  knew: boolean;
}

export function scoreDeck(obj: LangFlashObj, deck: LangCard[]): ScoredCard[] {
  return deck.map((card, i) => ({ card, knew: knewIt(obj, i) }));
}

export const scoreCount = (scored: ScoredCard[]): number =>
  scored.reduce((n, s) => n + (s.knew ? 1 : 0), 0);

export function verdict(known: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? known / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- session control (the exact patch each transition writes) ---------------

/** Turn the current card to its answer side. */
export const flipPatch = (): Partial<LangFlashObj> => ({ flipped: true });

/** Record a self-rating for card `i` and advance to the next card. */
export function ratePatch(i: number, knew: boolean): Record<string, unknown> {
  return { [knewField(i)]: knew ? 1 : undefined, idx: i + 1, flipped: false };
}

/** Restart the SAME deck from the first card (Play again). */
export const replayPatch = (obj: LangFlashObj): Record<string, unknown> => ({
  idx: 0,
  flipped: false,
  ...pruneRatings(obj),
});

/** A fresh deck: new order (bump round) from the first card (New deck). */
export const newDeckPatch = (obj: LangFlashObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  idx: 0,
  flipped: false,
  ...pruneRatings(obj),
});

/** Reset the whole session after a settings edit (see resetOnEdit). */
export const resetSessionPatch = (obj: LangFlashObj): Record<string, unknown> => ({
  idx: 0,
  flipped: false,
  ...pruneRatings(obj),
});
