// The vocabulary flash-cards engine: decks are deterministic, oriented by the
// chosen direction, bounded by the topic size, and the self-rating + session
// patches behave.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MIN_COUNT,
  clampCount,
  deriveDeck,
  flipPatch,
  knewField,
  knewIt,
  newDeckPatch,
  pruneRatings,
  ratePatch,
  replayPatch,
  resetSessionPatch,
  scoreCount,
  scoreDeck,
  verdict,
  type LangFlashObj,
} from "@/tools/langflashcards/deck";

const obj = (over: Partial<LangFlashObj> = {}): LangFlashObj => ({
  id: "lf-1",
  known: "en",
  learning: "fr",
  topic: "colours",
  count: 8,
  direction: "known-first",
  ...over,
});

describe("deriveDeck", () => {
  it("is deterministic", () => {
    expect(deriveDeck(obj({ round: 1 }))).toEqual(deriveDeck(obj({ round: 1 })));
  });

  it("bumping round reshuffles", () => {
    expect(deriveDeck(obj({ round: 0 }))).not.toEqual(deriveDeck(obj({ round: 1 })));
  });

  it("orients each card by direction", () => {
    const known = deriveDeck(obj({ direction: "known-first" }));
    for (const c of known) {
      // front is the English word, back the French — the reverse deck swaps them.
      expect(typeof c.front).toBe("string");
      expect(typeof c.back).toBe("string");
    }
    // Same seed, opposite direction → fronts and backs are swapped per card.
    const a = deriveDeck(obj({ direction: "known-first", round: 3 }));
    const b = deriveDeck(obj({ direction: "learning-first", round: 3 }));
    expect(a.map((c) => c.front)).toEqual(b.map((c) => c.back));
    expect(a.map((c) => c.back)).toEqual(b.map((c) => c.front));
  });

  it("count is bounded by MIN/MAX and the topic size", () => {
    expect(deriveDeck(obj({ count: 99 })).length).toBeLessThanOrEqual(MAX_COUNT);
    expect(deriveDeck(obj({ count: 1 })).length).toBeGreaterThan(0);
  });

  it("is empty for an unknown topic", () => {
    expect(deriveDeck(obj({ topic: "nope" }))).toEqual([]);
  });
});

describe("ratings + scoring", () => {
  it("ratePatch records the rating and advances", () => {
    expect(ratePatch(2, true)).toEqual({ [knewField(2)]: 1, idx: 3, flipped: false });
    expect(ratePatch(0, false)).toEqual({ [knewField(0)]: undefined, idx: 1, flipped: false });
  });

  it("knewIt reads a stored rating", () => {
    const o = obj({ [knewField(1)]: 1 });
    expect(knewIt(o, 1)).toBe(true);
    expect(knewIt(o, 0)).toBe(false);
  });

  it("scoreDeck + scoreCount tally the known cards", () => {
    const deck = deriveDeck(obj({ count: 5, round: 2 }));
    const o = obj({ count: 5, round: 2, [knewField(0)]: 1, [knewField(2)]: 1 });
    const scored = scoreDeck(o, deck);
    expect(scoreCount(scored)).toBe(2);
  });

  it("pruneRatings clears every fk: field", () => {
    const o = obj({ [knewField(0)]: 1, [knewField(4)]: 1 });
    expect(pruneRatings(o)).toEqual({ [knewField(0)]: undefined, [knewField(4)]: undefined });
  });
});

describe("session patches", () => {
  it("flip turns the card over", () => {
    expect(flipPatch()).toEqual({ flipped: true });
  });

  it("replay restarts and clears ratings, newDeck also bumps round", () => {
    const o = obj({ idx: 4, flipped: true, round: 2, [knewField(0)]: 1 });
    expect(replayPatch(o)).toEqual({ idx: 0, flipped: false, [knewField(0)]: undefined });
    expect(newDeckPatch(o)).toEqual({
      round: 3,
      idx: 0,
      flipped: false,
      [knewField(0)]: undefined,
    });
  });

  it("reset restarts without touching round", () => {
    const o = obj({ idx: 3, round: 5, [knewField(1)]: 1 });
    const patch = resetSessionPatch(o);
    expect(patch).not.toHaveProperty("round");
    expect(patch.idx).toBe(0);
  });
});

describe("misc", () => {
  it("clampCount bounds and defaults", () => {
    expect(clampCount(undefined)).toBe(DEFAULT_COUNT);
    expect(clampCount(1)).toBe(MIN_COUNT);
    expect(clampCount(99)).toBe(MAX_COUNT);
  });

  it("verdict scales with the score", () => {
    expect(verdict(10, 10).text).toBe("Brilliant!");
    expect(verdict(0, 0).text).toBe("Keep practising");
  });
});
