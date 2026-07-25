// The vocabulary flash-cards engine — pure, deterministic, no React.
//
// One widget runs a whole study session: a deck of word cards from a topic,
// shown ONE at a time. Like the maths flash cards, the deck is never stored — it
// is re-derived from the widget's identity and its `round` counter through a
// seeded shuffle (see rng.ts), so every collaborator sees the SAME order with no
// write races. Bumping `round` ("New deck") reshuffles everywhere at once.
//
// A card shows a word in one language; the learner thinks of the translation,
// flips to check, and taps "Knew it" or "Didn't know". That self-rating is live
// widget-state (one `fk:<i>` field per card) plus the position (`idx`) and flip
// (`flipped`), exactly the undo-invisible, synced, persisted model the maths
// widgets use.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  categoriesFromObj,
  categoriesLabel,
  vocabForCategories,
  type LangPair,
  type LevelFilter,
  type VocabPair,
} from "@/lang/pairs";

/** Which face shows first: the known word (produce the new language) or the
 *  learning word (recognise it). */
export type Direction = "known-first" | "learning-first";

export const DIRECTIONS: Direction[] = ["known-first", "learning-first"];

/** A learner-authored word pair: typed into the "My words" table, or collected
 *  into a practice set. The picture cue and the readings ride along (optional)
 *  so a word gathered off a topic card keeps them. */
export interface CustomPair {
  known: string;
  learning: string;
  emoji?: string;
  knownPhonetic?: string;
  learningPhonetic?: string;
}

/** The shape the component reads: params plus live widget-state (fk:*). */
export interface LangFlashObj {
  id: string;
  known: string;
  learning: string;
  /** The themes the deck draws from. Older objects carry a single `category`
   *  (or a legacy `topic`), read as a one-theme list. */
  categories?: string[];
  category?: string;
  topic?: string;
  /** Difficulty filter; absent = "mixed" (all levels). */
  level?: LevelFilter;
  /** Legacy: an old deck-size cap. Ignored now — a deck holds every word the
   *  chosen content offers. Kept optional so older boards still load. */
  count?: number;
  direction: Direction;
  /** Show the picture cue on each card ("easy" mode); false = words only. */
  easy?: boolean;
  /** When present, the deck is the learner's OWN words (from the My words
   *  table) instead of a preset topic — `topic` is then ignored. */
  custom?: CustomPair[];
  /** This deck IS the practice set: the words gathered off other decks with
   *  "Didn't know". They live in `custom` and the list shrinks as they're
   *  learned, so an empty set means an empty deck (never a topic fallback). */
  practice?: boolean;
  // --- live widget state (via updateWidgetState, undo-invisible) ---
  /** Monotonic "new deck" counter; the deck is re-derived from it. */
  round?: number;
  /** Current card index [0..deck length]; === length means "finished" (summary). */
  idx?: number;
  /** Is the current card turned to its answer side? */
  flipped?: boolean;
  [field: string]: unknown; // fk:<i> -> 1 when the learner rated it "knew it"
}

/** A dealt card: the prompt (front) and the answer (back), plus its emoji and
 *  optional per-face pronunciation readings (shown, never spoken). */
export interface LangCard {
  front: string;
  back: string;
  emoji?: string;
  frontPhonetic?: string;
  backPhonetic?: string;
}

const pairOf = (obj: LangFlashObj): LangPair => ({
  known: obj.known,
  learning: obj.learning,
});

/** The theme ids the deck draws from (supports several; falls back to a legacy
 *  single `category`/`topic`). */
export const categoriesOf = (obj: LangFlashObj): string[] => categoriesFromObj(obj);
/** The level filter (absent = every level). */
export const levelOf = (obj: LangFlashObj): LevelFilter => obj.level ?? "mixed";

/** Orient a resolved vocab pair onto a card per the chosen direction. */
function toCard(v: VocabPair, dir: Direction): LangCard {
  return dir === "known-first"
    ? {
        front: v.known,
        back: v.learning,
        emoji: v.emoji,
        frontPhonetic: v.knownPhonetic,
        backPhonetic: v.learningPhonetic,
      }
    : {
        front: v.learning,
        back: v.known,
        emoji: v.emoji,
        frontPhonetic: v.learningPhonetic,
        backPhonetic: v.knownPhonetic,
      };
}

/** True when this widget runs on the learner's own words rather than a topic. */
export const isCustom = (obj: LangFlashObj): boolean =>
  Array.isArray(obj.custom) && obj.custom.length > 0;

/** True when this deck IS the practice set (see "the practice set" below). */
export const isPractice = (obj: LangFlashObj): boolean => obj.practice === true;

/** Does this deck carry its OWN words (My words / the practice set) rather than
 *  drawing on a theme? A practice set counts even when empty — it has simply
 *  been cleared, and must NOT fall back to a topic. */
const ownWords = (obj: LangFlashObj): boolean => isPractice(obj) || isCustom(obj);

/** The words a own-words deck holds (the practice set's live contents). */
export const customWords = (obj: LangFlashObj): CustomPair[] =>
  Array.isArray(obj.custom) ? obj.custom : [];

/** The pairs a widget draws from: the learner's own words, or a topic's set. */
function sourcePairs(obj: LangFlashObj): VocabPair[] {
  if (ownWords(obj)) {
    return customWords(obj)
      .filter((p) => p.known?.trim() && p.learning?.trim())
      .map((p) => ({
        known: p.known.trim(),
        learning: p.learning.trim(),
        emoji: p.emoji,
        knownPhonetic: p.knownPhonetic,
        learningPhonetic: p.learningPhonetic,
      }));
  }
  return vocabForCategories(categoriesOf(obj), levelOf(obj), pairOf(obj));
}

/** Derive a widget's deck deterministically from its state. Shuffles ALL the
 *  source pairs by seed — the deck holds every word the chosen content offers
 *  (the learner's own words, or every pair in the selected themes at the level),
 *  in a stable, collaboration-safe order. */
export function deriveDeck(obj: LangFlashObj): LangCard[] {
  const round = obj.round ?? 0;
  const pairs = sourcePairs(obj);
  // Direction is deliberately NOT in the seed: it only orients each card
  // (front/back), so flipping it keeps the SAME deck order and simply turns the
  // cards over — it never reshuffles the words.
  const key = ownWords(obj)
    ? `custom:${pairs.length}`
    : `${categoriesOf(obj).join(",")}:${levelOf(obj)}`;
  const rng = rngFromSeed(`${obj.id}:${round}:${key}:${obj.known}:${obj.learning}`);
  return shuffle(rng, pairs).map((v) => toCard(v, obj.direction));
}

/** The effective card count for a widget (bounded by the source size). */
export const deckLength = (obj: LangFlashObj): number => deriveDeck(obj).length;

/** Header title, e.g. "Colours" — or "My words" for a learner's own deck. */
export function deckTitle(obj: LangFlashObj): string {
  if (isPractice(obj)) return "🔁 Practice set";
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

/** The dealt cards of a finished run, split by how the learner rated them. */
export const missedCards = (obj: LangFlashObj, deck: LangCard[]): LangCard[] =>
  deck.filter((_, i) => !knewIt(obj, i));
export const knownCards = (obj: LangFlashObj, deck: LangCard[]): LangCard[] =>
  deck.filter((_, i) => knewIt(obj, i));

export function verdict(known: number, total: number): { emoji: string; text: string } {
  const pct = total > 0 ? known / total : 0;
  if (pct >= 0.9) return { emoji: "🌟", text: "Brilliant!" };
  if (pct >= 0.7) return { emoji: "🎉", text: "Great work!" };
  if (pct >= 0.5) return { emoji: "👍", text: "Good effort" };
  return { emoji: "💪", text: "Keep practising" };
}

// --- the practice set -------------------------------------------------------
//
// The words a learner taps "Didn't know" on can be COLLECTED into a practice
// set: an ordinary custom deck flagged `practice: true`, whose `custom` list
// holds the gathered pairs. One set per language pair — collecting again merges
// into it rather than littering the board — and it SHRINKS as words are learned
// ("remove the ones I knew" at the end of a practice run).
//
// Pairs are always stored known-first, so a set gathered off a reversed deck
// still reads the right way round, and the two decks agree on identity.

/** The storable pair behind a dealt card (undoing the direction's orientation). */
export function pairOfCard(card: LangCard, direction: Direction): CustomPair {
  const knownFirst = direction === "known-first";
  const pair: CustomPair = {
    known: knownFirst ? card.front : card.back,
    learning: knownFirst ? card.back : card.front,
  };
  const knownPhonetic = knownFirst ? card.frontPhonetic : card.backPhonetic;
  const learningPhonetic = knownFirst ? card.backPhonetic : card.frontPhonetic;
  if (card.emoji) pair.emoji = card.emoji;
  if (knownPhonetic) pair.knownPhonetic = knownPhonetic;
  if (learningPhonetic) pair.learningPhonetic = learningPhonetic;
  return pair;
}

/** A pair's identity — what makes two entries "the same word". Case- and
 *  space-insensitive; the NUL keeps the two sides from bleeding together. */
const pairKey = (p: CustomPair): string =>
  `${p.known.trim().toLowerCase()}\u0000${p.learning.trim().toLowerCase()}`;

/** The cards of a finished run the learner did NOT know, ready to collect. */
export const missedPairs = (obj: LangFlashObj, deck: LangCard[]): CustomPair[] =>
  missedCards(obj, deck).map((c) => pairOfCard(c, obj.direction));

/** The cards of a finished run the learner DID know, ready to retire. */
export const knownPairs = (obj: LangFlashObj, deck: LangCard[]): CustomPair[] =>
  knownCards(obj, deck).map((c) => pairOfCard(c, obj.direction));

/** Add pairs to a set, keeping the existing order and skipping words already
 *  in it (so collecting the same card twice never duplicates it). */
export function mergePairs(set: CustomPair[], add: CustomPair[]): CustomPair[] {
  const seen = new Set(set.map(pairKey));
  const out = [...set];
  for (const p of add) {
    const key = pairKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Drop pairs from a set (by identity) — the learned words leaving practice. */
export function removePairs(set: CustomPair[], remove: CustomPair[]): CustomPair[] {
  const drop = new Set(remove.map(pairKey));
  return set.filter((p) => !drop.has(pairKey(p)));
}

/** How many of `add` are genuinely new to `set` (0 ⇒ collecting is a no-op). */
export const newToSet = (set: CustomPair[], add: CustomPair[]): number =>
  mergePairs(set, add).length - set.length;

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
