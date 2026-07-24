// The gender-sort engine: rounds are deterministic, baskets are the distinct
// articles present, placements validate against the word's real article, and the
// session patches place / reset as expected. Drives the built-in English→French
// content (loaded into VOCAB at import), where nouns carry le / la.

import { describe, expect, it } from "vitest";
import { articlesForLearning } from "@/lang/pairs";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MIN_COUNT,
  allSorted,
  cardsInBucket,
  clampCount,
  correctCount,
  deriveRound,
  isCardCorrect,
  isCardWrong,
  newRoundPatch,
  pileCards,
  placePatch,
  placedBucket,
  pruneResponses,
  removePatch,
  resetSessionPatch,
  roundSize,
  type GenderObj,
} from "@/tools/langgender/gender";

const obj = (over: Partial<GenderObj> = {}): GenderObj => ({
  id: "g-1",
  known: "en",
  learning: "fr",
  category: "animals",
  level: "mixed",
  count: 6,
  ...over,
});

/** The basket index that correctly holds word `i`. */
const rightBucket = (o: GenderObj, i: number): number => {
  const r = deriveRound(o);
  return r.buckets.indexOf(r.items[i].article);
};

describe("deriveRound", () => {
  it("is deterministic for the same object", () => {
    expect(deriveRound(obj({ round: 2 }))).toEqual(deriveRound(obj({ round: 2 })));
  });

  it("bumping round reshuffles the words", () => {
    const a = deriveRound(obj({ round: 0 }));
    const b = deriveRound(obj({ round: 1 }));
    expect(a.items.map((n) => n.learning)).not.toEqual(b.items.map((n) => n.learning));
  });

  it("baskets are exactly the distinct articles present, no duplicates", () => {
    const r = deriveRound(obj({ count: MAX_COUNT }));
    const present = new Set(r.items.map((n) => n.article));
    expect(new Set(r.buckets)).toEqual(present);
    expect(r.buckets.length).toBe(new Set(r.buckets).size);
  });

  it("French nouns split into le and la — a real two-basket game", () => {
    const r = deriveRound(obj({ count: MAX_COUNT }));
    expect(r.buckets).toEqual(expect.arrayContaining(["le", "la"]));
  });

  it("count is bounded by MIN/MAX and the topic size", () => {
    expect(deriveRound(obj({ count: 99 })).items.length).toBeLessThanOrEqual(MAX_COUNT);
    expect(roundSize(obj())).toBeLessThanOrEqual(MAX_COUNT);
  });

  it("is empty for a topic with no gendered nouns", () => {
    expect(deriveRound(obj({ category: "nope" })).items).toEqual([]);
  });
});

describe("placements + correctness", () => {
  it("a word in its article's basket is correct; the other basket is wrong", () => {
    const o0 = obj();
    const good = rightBucket(o0, 0);
    const r = deriveRound(o0);
    const bad = (good + 1) % r.buckets.length;
    const correct = obj({ ...placePatch(0, good) });
    expect(placedBucket(correct, 0)).toBe(good);
    expect(isCardCorrect(deriveRound(correct), correct, 0)).toBe(true);
    expect(isCardWrong(deriveRound(correct), correct, 0)).toBe(false);
    // Only meaningful when there are 2+ baskets (French: le/la).
    if (r.buckets.length > 1) {
      const wrong = obj({ ...placePatch(0, bad) });
      expect(isCardCorrect(deriveRound(wrong), wrong, 0)).toBe(false);
      expect(isCardWrong(deriveRound(wrong), wrong, 0)).toBe(true);
    }
  });

  it("pile shrinks as words are placed; cardsInBucket lists them", () => {
    const b = rightBucket(obj(), 0);
    const o = obj({ ...placePatch(0, b) });
    const r = deriveRound(o);
    expect(pileCards(r, o)).not.toContain(0);
    expect(cardsInBucket(r, o, b)).toContain(0);
  });

  it("allSorted is true only when every word is in the right basket", () => {
    const o0 = obj();
    const r = deriveRound(o0);
    const patch: Record<string, unknown> = {};
    for (let i = 0; i < r.items.length; i++) patch[`gb:${i}`] = r.buckets.indexOf(r.items[i].article);
    const done = obj({ ...patch });
    expect(allSorted(done)).toBe(true);
    expect(correctCount(deriveRound(done), done)).toBe(r.items.length);
    // Move one to a different basket (only breaks it when 2+ baskets exist).
    if (r.buckets.length > 1) {
      patch["gb:0"] = (r.buckets.indexOf(r.items[0].article) + 1) % r.buckets.length;
      expect(allSorted(obj({ ...patch }))).toBe(false);
    }
  });
});

describe("patches", () => {
  it("removePatch clears a placement", () => {
    expect(removePatch(2)).toEqual({ "gb:2": undefined });
  });

  it("pruneResponses clears every gb: field", () => {
    const o = obj({ ...placePatch(0, 1), ...placePatch(3, 0) });
    expect(pruneResponses(o)).toEqual({ "gb:0": undefined, "gb:3": undefined });
  });

  it("newRound bumps round and clears placements", () => {
    const o = obj({ round: 1, ...placePatch(1, 0) });
    const patch = newRoundPatch(o);
    expect(patch.round).toBe(2);
    expect(patch["gb:1"]).toBeUndefined();
  });

  it("reset clears placements without touching round", () => {
    const o = obj({ round: 3, ...placePatch(0, 1) });
    const patch = resetSessionPatch(o);
    expect(patch).toEqual({ "gb:0": undefined });
    expect(patch).not.toHaveProperty("round");
  });

  it("clampCount bounds and defaults", () => {
    expect(clampCount(undefined)).toBe(DEFAULT_COUNT);
    expect(clampCount(1)).toBe(MIN_COUNT);
    expect(clampCount(99)).toBe(MAX_COUNT);
  });
});

describe("content gate", () => {
  it("French has 2+ articles (game offered); English has fewer (hidden)", () => {
    expect(articlesForLearning({ known: "en", learning: "fr" }).length).toBeGreaterThanOrEqual(2);
    expect(articlesForLearning({ known: "fr", learning: "en" }).length).toBeLessThan(2);
  });
});
