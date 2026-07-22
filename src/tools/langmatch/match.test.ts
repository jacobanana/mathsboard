// The match-the-translation engine: rounds are deterministic, the right column
// is a genuine scramble of the left, connections validate correctly, and the
// session patches match / reset as expected.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MIN_COUNT,
  clampCount,
  correctSlotFor,
  deriveRound,
  isConnectionCorrect,
  isMatched,
  matchPatch,
  matchedCount,
  newRoundPatch,
  pruneMatches,
  resetSessionPatch,
  roundSize,
  type MatchObj,
} from "@/tools/langmatch/match";

const obj = (over: Partial<MatchObj> = {}): MatchObj => ({
  id: "m-1",
  known: "en",
  learning: "fr",
  topic: "colours",
  count: 5,
  ...over,
});

describe("deriveRound", () => {
  it("is deterministic for the same object", () => {
    expect(deriveRound(obj({ round: 2 }))).toEqual(deriveRound(obj({ round: 2 })));
  });

  it("bumping round reshuffles", () => {
    const a = deriveRound(obj({ round: 0 }));
    const b = deriveRound(obj({ round: 1 }));
    expect(a.rightOrder).not.toEqual(b.rightOrder);
  });

  it("left and right hold the same pairs, right is a permutation", () => {
    const r = deriveRound(obj({ count: 5 }));
    expect(r.items).toHaveLength(5);
    expect(r.left).toHaveLength(5);
    expect(r.right).toHaveLength(5);
    // rightOrder is a permutation of 0..n-1
    expect([...r.rightOrder].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    // right[r] shows the learning word of items[rightOrder[r]]
    r.rightOrder.forEach((k, slot) => {
      expect(r.right[slot]).toBe(r.items[k].learning);
    });
  });

  it("count is bounded by MIN/MAX and the topic size", () => {
    expect(deriveRound(obj({ count: 99 })).items.length).toBeLessThanOrEqual(MAX_COUNT);
    expect(deriveRound(obj({ count: 1 })).items.length).toBeGreaterThanOrEqual(
      Math.min(MIN_COUNT, roundSize(obj({ count: 1 }))),
    );
  });

  it("is empty for an unknown topic", () => {
    expect(deriveRound(obj({ topic: "nope" })).items).toEqual([]);
  });
});

describe("connection validity", () => {
  it("the correct slot for a left word maps back to it", () => {
    const round = deriveRound(obj());
    for (let i = 0; i < round.items.length; i++) {
      const slot = correctSlotFor(round, i);
      expect(isConnectionCorrect(round, i, slot)).toBe(true);
      expect(round.right[slot]).toBe(round.items[i].learning);
    }
  });

  it("a wrong slot is rejected", () => {
    const round = deriveRound(obj());
    const slot = correctSlotFor(round, 0);
    const wrongSlot = (slot + 1) % round.items.length;
    // With distinct words this different slot is genuinely wrong.
    expect(isConnectionCorrect(round, 0, wrongSlot)).toBe(false);
  });
});

describe("matched state + patches", () => {
  it("matchPatch marks a left word, isMatched reads it", () => {
    const o = obj({ ...matchPatch(2) });
    expect(isMatched(o, 2)).toBe(true);
    expect(isMatched(o, 0)).toBe(false);
    expect(matchedCount(o, 5)).toBe(1);
  });

  it("pruneMatches clears every mm: field", () => {
    const o = obj({ ...matchPatch(0), ...matchPatch(3) });
    const patch = pruneMatches(o);
    expect(patch).toEqual({ "mm:0": undefined, "mm:3": undefined });
  });

  it("newRound bumps round and clears matches", () => {
    const o = obj({ round: 1, ...matchPatch(1) });
    const patch = newRoundPatch(o);
    expect(patch.round).toBe(2);
    expect(patch["mm:1"]).toBeUndefined();
  });

  it("reset clears matches without touching round", () => {
    const o = obj({ round: 3, ...matchPatch(0) });
    const patch = resetSessionPatch(o);
    expect(patch).toEqual({ "mm:0": undefined });
    expect(patch).not.toHaveProperty("round");
  });
});

describe("misc", () => {
  it("clampCount bounds and defaults", () => {
    expect(clampCount(undefined)).toBe(DEFAULT_COUNT);
    expect(clampCount(1)).toBe(MIN_COUNT);
    expect(clampCount(99)).toBe(MAX_COUNT);
  });
});
