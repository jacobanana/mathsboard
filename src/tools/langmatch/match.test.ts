// The match-the-translation engine: rounds are deterministic, the right column
// is a genuine scramble of the left, connections validate correctly, and the
// session patches match / reset as expected.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MIN_COUNT,
  allMatched,
  clampCount,
  connectPatch,
  connections,
  connectionSlot,
  correctCount,
  correctSlotFor,
  deriveRound,
  disconnectPatch,
  isConnectionCorrect,
  leftIsCorrect,
  newRoundPatch,
  occupiedRightSlots,
  pruneConnections,
  resetSessionPatch,
  roundSize,
  type MatchObj,
} from "@/tools/langmatch/match";

const obj = (over: Partial<MatchObj> = {}): MatchObj => ({
  id: "m-1",
  known: "en",
  learning: "fr",
  category: "colours",
  level: "mixed",
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

  it("is empty for an unknown category", () => {
    expect(deriveRound(obj({ category: "nope" })).items).toEqual([]);
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

describe("connections + patches", () => {
  it("connectPatch joins a left word to a right slot; connectionSlot reads it", () => {
    const o = obj({ ...connectPatch(2, 4) });
    expect(connectionSlot(o, 2)).toBe(4);
    expect(connectionSlot(o, 0)).toBeNull();
  });

  it("keeps BOTH correct and wrong connections, tagged by correctness", () => {
    const round = deriveRound(obj());
    const goodSlot = correctSlotFor(round, 0);
    const badSlot = (goodSlot + 1) % round.items.length;
    const o = obj({ ...connectPatch(0, goodSlot), ...connectPatch(1, badSlot) });
    const cs = connections(round, o);
    expect(cs).toEqual(
      expect.arrayContaining([
        { left: 0, right: goodSlot, correct: true },
        { left: 1, right: badSlot, correct: false },
      ]),
    );
    expect(leftIsCorrect(round, o, 0)).toBe(true);
    expect(leftIsCorrect(round, o, 1)).toBe(false);
    // only the correct one counts toward completion
    expect(correctCount(round, o)).toBe(1);
    expect(occupiedRightSlots(round, o)).toEqual(new Set([goodSlot, badSlot]));
  });

  it("disconnectPatch removes a connection", () => {
    const patch = disconnectPatch(1);
    expect(patch).toEqual({ "mc:1": undefined });
  });

  it("allMatched is true only when every left is correctly joined", () => {
    const round = deriveRound(obj());
    const patch: Record<string, unknown> = {};
    for (let i = 0; i < round.items.length; i++) patch[`mc:${i}`] = correctSlotFor(round, i);
    expect(allMatched(obj({ ...patch }))).toBe(true);
    // break one → not done
    patch["mc:0"] = (correctSlotFor(round, 0) + 1) % round.items.length;
    expect(allMatched(obj({ ...patch }))).toBe(false);
  });

  it("pruneConnections clears every mc: field", () => {
    const o = obj({ ...connectPatch(0, 1), ...connectPatch(3, 2) });
    expect(pruneConnections(o)).toEqual({ "mc:0": undefined, "mc:3": undefined });
  });

  it("newRound bumps round and clears connections", () => {
    const o = obj({ round: 1, ...connectPatch(1, 0) });
    const patch = newRoundPatch(o);
    expect(patch.round).toBe(2);
    expect(patch["mc:1"]).toBeUndefined();
  });

  it("reset clears connections without touching round", () => {
    const o = obj({ round: 3, ...connectPatch(0, 2) });
    const patch = resetSessionPatch(o);
    expect(patch).toEqual({ "mc:0": undefined });
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
