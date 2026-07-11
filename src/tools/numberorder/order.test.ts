// The number-order engine: sessions are deterministic from the seed, every
// round holds the right count of DISTINCT numbers in its level's range, the
// pick/sort correctness is right, the tap interaction builds/removes/locks the
// chain as expected, and the session patches move / reset the run.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUMS,
  DEFAULT_ROUNDS,
  LEVELS,
  MAX_NUMS,
  MAX_ROUNDS,
  MIN_NUMS,
  MIN_ROUNDS,
  MODES,
  TARGETS,
  applyTap,
  chainField,
  checkField,
  clampNums,
  clampRounds,
  deckTitle,
  deriveDeck,
  formatNum,
  goalPrompt,
  isChecked,
  isPickGoal,
  newDeckPatch,
  nextPatch,
  pickIndex,
  pruneResponses,
  readChain,
  replayPatch,
  resetSessionPatch,
  retryPatch,
  roundCorrect,
  scoreCount,
  scoreDeck,
  sortOrder,
  tapStatePatch,
  verdict,
  writeChain,
  type OrderObj,
  type OrderRound,
} from "@/tools/numberorder/order";

const obj = (over: Partial<OrderObj> = {}): OrderObj => ({
  id: "no-1",
  mode: "pick",
  target: "biggest",
  level: "easy",
  count: 3,
  rounds: 8,
  ...over,
});

const RANGE: Record<string, { lo: number; hi: number }> = {
  easy: { lo: 1, hi: 100 },
  medium: { lo: 1, hi: 9_999 },
  hard: { lo: 1, hi: 9_999_999 },
};

describe("deriveDeck", () => {
  it("is deterministic — same object derives the identical session", () => {
    const a = deriveDeck(obj({ mode: "sort", target: "mix", level: "hard", round: 3 }));
    const b = deriveDeck(obj({ mode: "sort", target: "mix", level: "hard", round: 3 }));
    expect(a).toEqual(b);
  });

  it("bumping round reshuffles", () => {
    const a = deriveDeck(obj({ round: 0 }));
    const b = deriveDeck(obj({ round: 1 }));
    expect(a).not.toEqual(b);
  });

  it("has `rounds` rounds, each with `count` distinct in-range numbers", () => {
    for (const level of LEVELS) {
      for (const count of [MIN_NUMS, 4, MAX_NUMS]) {
        const deck = deriveDeck(obj({ level, count, rounds: 10 }));
        expect(deck).toHaveLength(10);
        for (const r of deck) {
          expect(r.nums).toHaveLength(count);
          expect(new Set(r.nums).size).toBe(count); // distinct
          for (const n of r.nums) {
            expect(n).toBeGreaterThanOrEqual(RANGE[level].lo);
            expect(n).toBeLessThanOrEqual(RANGE[level].hi);
            expect(Number.isInteger(n)).toBe(true);
          }
        }
      }
    }
  });

  it("resolves goals to the mode's family", () => {
    for (const mode of MODES) {
      for (const target of TARGETS) {
        const deck = deriveDeck(obj({ mode, target, rounds: 12 }));
        for (const r of deck) {
          if (mode === "pick") expect(isPickGoal(r.goal)).toBe(true);
          else expect(isPickGoal(r.goal)).toBe(false);
        }
      }
    }
  });

  it("a fixed target pins every round's goal; mix produces both", () => {
    const biggest = deriveDeck(obj({ mode: "pick", target: "biggest", rounds: 12 }));
    expect(biggest.every((r) => r.goal === "biggest")).toBe(true);

    const smallestFirst = deriveDeck(obj({ mode: "sort", target: "smallest", rounds: 12 }));
    expect(smallestFirst.every((r) => r.goal === "increasing")).toBe(true);

    const mix = deriveDeck(obj({ mode: "sort", target: "mix", rounds: 30 }));
    const goals = new Set(mix.map((r) => r.goal));
    expect(goals.has("increasing")).toBe(true);
    expect(goals.has("decreasing")).toBe(true);
  });

  it("never deals a sort round already in its target order", () => {
    const deck = deriveDeck(obj({ mode: "sort", target: "mix", count: 4, rounds: 30 }));
    for (const r of deck) {
      expect(r.nums).not.toEqual(sortOrder(r).map((i) => r.nums[i]));
    }
  });

  it("clamps counts and rounds into bounds", () => {
    expect(clampNums(0)).toBe(MIN_NUMS);
    expect(clampNums(99)).toBe(MAX_NUMS);
    expect(clampNums(undefined)).toBe(DEFAULT_NUMS);
    expect(clampRounds(0)).toBe(MIN_ROUNDS);
    expect(clampRounds(999)).toBe(MAX_ROUNDS);
    expect(clampRounds(undefined)).toBe(DEFAULT_ROUNDS);
  });
});

describe("correctness", () => {
  const pick = (nums: number[], goal: OrderRound["goal"]): OrderRound => ({ nums, goal });

  it("pickIndex finds the biggest / smallest tile", () => {
    expect(pickIndex(pick([3, 9, 5], "biggest"))).toBe(1);
    expect(pickIndex(pick([3, 9, 5], "smallest"))).toBe(0);
    expect(pickIndex(pick([8, 2, 6, 4], "smallest"))).toBe(1);
  });

  it("sortOrder gives the ascending / descending index chain", () => {
    const r = pick([5, 1, 9, 3], "increasing");
    expect(sortOrder(r)).toEqual([1, 3, 0, 2]); // 1,3,5,9
    const d = pick([5, 1, 9, 3], "decreasing");
    expect(sortOrder(d)).toEqual([2, 0, 3, 1]); // 9,5,3,1
  });

  it("roundCorrect marks the intended chain right and others wrong", () => {
    const r = pick([5, 1, 9, 3], "increasing");
    expect(roundCorrect(r, [1, 3, 0, 2])).toBe(true);
    expect(roundCorrect(r, [1, 3, 2, 0])).toBe(false);
    expect(roundCorrect(r, [1, 3, 0])).toBe(false); // incomplete

    const p = pick([3, 9, 5], "biggest");
    expect(roundCorrect(p, [1])).toBe(true);
    expect(roundCorrect(p, [0])).toBe(false);
    expect(roundCorrect(p, [])).toBe(false);
  });
});

describe("applyTap", () => {
  // nums [5,1,9] increasing → correct chain is indices [1,0,2] (values 1,5,9).
  const sortRound: OrderRound = { nums: [5, 1, 9], goal: "increasing" };

  it("locks a pick round on the first tap and reports correctness", () => {
    const r: OrderRound = { nums: [3, 9, 5], goal: "biggest" };
    const ok = applyTap(r, [], false, 1);
    expect(ok).toEqual({ chain: [1], checked: true, justChecked: true, correct: true });
    const no = applyTap(r, [], false, 0);
    expect(no).toMatchObject({ checked: true, correct: false });
  });

  it("builds a sort chain, removes on a repeat tap, and locks when full", () => {
    let out = applyTap(sortRound, [], false, 1)!; // tap 1
    expect(out).toMatchObject({ chain: [1], checked: false });
    out = applyTap(sortRound, out.chain, false, 2)!; // tap 2
    expect(out).toMatchObject({ chain: [1, 2], checked: false });
    // tap 2 again -> removed (the correction)
    out = applyTap(sortRound, out.chain, false, 2)!;
    expect(out).toMatchObject({ chain: [1], checked: false });
    // complete correctly: [1,0,2]
    out = applyTap(sortRound, [1, 0], false, 2)!;
    expect(out).toMatchObject({ chain: [1, 0, 2], checked: true, justChecked: true, correct: true });
  });

  it("locks a full but wrong sort chain as incorrect", () => {
    const out = applyTap(sortRound, [1, 2], false, 0)!; // [1,2,0] = 1,9,5 — wrong
    expect(out).toMatchObject({ chain: [1, 2, 0], checked: true, correct: false });
  });

  it("ignores taps once checked", () => {
    expect(applyTap(sortRound, [1, 0, 2], true, 1)).toBeNull();
  });
});

describe("response state", () => {
  it("reads and writes a chain round-trip", () => {
    expect(writeChain([2, 0, 1])).toBe("2,0,1");
    const o = obj({ [chainField(3)]: "2,0,1" });
    expect(readChain(o, 3)).toEqual([2, 0, 1]);
    expect(readChain(o, 4)).toEqual([]); // unanswered
  });

  it("tapStatePatch stores/clears the chain and the checked flag", () => {
    const built = tapStatePatch(2, { chain: [1, 0], checked: false, justChecked: false, correct: false });
    expect(built[chainField(2)]).toBe("1,0");
    expect(built[checkField(2)]).toBeUndefined();

    const locked = tapStatePatch(2, { chain: [1], checked: true, justChecked: true, correct: true });
    expect(locked[checkField(2)]).toBe(1);

    const emptied = tapStatePatch(2, { chain: [], checked: false, justChecked: false, correct: false });
    expect(emptied[chainField(2)]).toBeUndefined();
  });

  it("isChecked reflects the flag; retryPatch clears a round", () => {
    expect(isChecked(obj({ [checkField(1)]: 1 }), 1)).toBe(true);
    expect(isChecked(obj(), 1)).toBe(false);
    const patch = retryPatch(1);
    expect(patch[chainField(1)]).toBeUndefined();
    expect(patch[checkField(1)]).toBeUndefined();
  });

  it("pruneResponses removes every no:/nc: field", () => {
    const o = obj({ [chainField(0)]: "1", [checkField(0)]: 1, [chainField(5)]: "2,1,0" });
    const patch = pruneResponses(o);
    expect(patch[chainField(0)]).toBeUndefined();
    expect(patch[checkField(0)]).toBeUndefined();
    expect(patch[chainField(5)]).toBeUndefined();
    expect(Object.keys(patch).sort()).toEqual([chainField(0), chainField(5), checkField(0)].sort());
  });
});

describe("scoring", () => {
  it("scores each round from its stored chain (only when checked)", () => {
    const base = obj({ mode: "sort", target: "smallest", count: 3, rounds: 3, round: 0 });
    const deck = deriveDeck(base);
    // Answer round 0 correctly, round 1 wrong-and-checked, leave round 2 blank.
    const good = sortOrder(deck[0]);
    const bad = [...sortOrder(deck[1])].reverse();
    const state = obj({
      ...base,
      [chainField(0)]: writeChain(good),
      [checkField(0)]: 1,
      [chainField(1)]: writeChain(bad),
      [checkField(1)]: 1,
    });
    const scored = scoreDeck(state, deck);
    expect(scored[0].correct).toBe(true);
    expect(scored[1].correct).toBe(false);
    expect(scored[2].correct).toBe(false);
    expect(scoreCount(scored)).toBe(1);
  });

  it("a correct chain that was never checked does not count", () => {
    const base = obj({ mode: "sort", target: "smallest", count: 3, rounds: 2, round: 0 });
    const deck = deriveDeck(base);
    const state = obj({ ...base, [chainField(0)]: writeChain(sortOrder(deck[0])) });
    expect(scoreDeck(state, deck)[0].correct).toBe(false);
  });

  it("verdict thresholds", () => {
    expect(verdict(10, 10).text).toBe("Brilliant!");
    expect(verdict(8, 10).text).toBe("Great work!");
    expect(verdict(5, 10).text).toBe("Good effort");
    expect(verdict(1, 10).text).toBe("Keep practising");
  });
});

describe("labels", () => {
  it("deckTitle and goalPrompt read cleanly", () => {
    expect(deckTitle(obj({ mode: "pick", level: "easy" }))).toContain("Tap one");
    expect(deckTitle(obj({ mode: "sort", level: "hard" }))).toContain("Put in order");
    expect(goalPrompt("biggest")).toBe("Tap the biggest");
    expect(goalPrompt("smallest")).toBe("Tap the smallest");
    expect(goalPrompt("increasing")).toContain("smallest");
    expect(goalPrompt("decreasing")).toContain("biggest");
  });

  it("formatNum groups thousands only above 999", () => {
    expect(formatNum(20)).toBe("20");
    expect(formatNum(999)).toBe("999");
    expect(formatNum(1234)).toBe("1,234");
    expect(formatNum(9999999)).toBe("9,999,999");
  });
});

describe("session control", () => {
  it("nextPatch advances the round index", () => {
    expect(nextPatch(obj({ idx: 2 })).idx).toBe(3);
    expect(nextPatch(obj({})).idx).toBe(1);
  });

  it("replayPatch restarts from zero and clears responses", () => {
    const o = obj({ idx: 4, [chainField(0)]: "1", [checkField(0)]: 1 });
    const patch = replayPatch(o);
    expect(patch.idx).toBe(0);
    expect(patch.round).toBeUndefined();
    expect(patch[chainField(0)]).toBeUndefined();
  });

  it("newDeckPatch bumps round, restarts and clears responses", () => {
    const o = obj({ round: 2, idx: 5, [chainField(1)]: "0,1" });
    const patch = newDeckPatch(o);
    expect(patch.round).toBe(3);
    expect(patch.idx).toBe(0);
    expect(patch[chainField(1)]).toBeUndefined();
  });

  it("resetSessionPatch restarts and clears (used on edit)", () => {
    const o = obj({ idx: 3, [checkField(2)]: 1 });
    const patch = resetSessionPatch(o);
    expect(patch.idx).toBe(0);
    expect(patch[checkField(2)]).toBeUndefined();
  });
});
