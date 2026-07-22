// The sentence-builder engine: rounds are deterministic, tiles are a scramble of
// the answer words, correctness compares the produced WORD sequence (so repeated
// words still check right), and the tap interaction adds/removes and locks.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  applyTap,
  builtWords,
  clampRounds,
  deriveDeck,
  newDeckPatch,
  nextPatch,
  readChain,
  resetSessionPatch,
  roundCorrect,
  tokenize,
  type SentenceObj,
  type SentenceRound,
} from "@/tools/langsentence/builder";

const obj = (over: Partial<SentenceObj> = {}): SentenceObj => ({
  id: "s-1",
  known: "en",
  learning: "fr",
  category: "greetings",
  level: "mixed",
  rounds: 6,
  ...over,
});

describe("tokenize", () => {
  it("splits on whitespace and keeps standalone punctuation", () => {
    expect(tokenize("Le chat est noir.")).toEqual(["Le", "chat", "est", "noir."]);
    expect(tokenize("Comment ça va ?")).toEqual(["Comment", "ça", "va", "?"]);
  });
});

describe("deriveDeck", () => {
  it("is deterministic", () => {
    expect(deriveDeck(obj({ round: 1 }))).toEqual(deriveDeck(obj({ round: 1 })));
  });

  it("bumping round reshuffles", () => {
    expect(deriveDeck(obj({ round: 0 }))).not.toEqual(deriveDeck(obj({ round: 1 })));
  });

  it("each round's tiles are a permutation of its answer words", () => {
    for (const r of deriveDeck(obj({ rounds: MAX_ROUNDS }))) {
      expect([...r.tiles].sort()).toEqual([...r.answer].sort());
      expect(r.prompt).not.toBe("");
    }
  });

  it("count is bounded by the set size", () => {
    expect(deriveDeck(obj({ rounds: 99 })).length).toBeLessThanOrEqual(MAX_ROUNDS);
  });

  it("is empty for an unknown set", () => {
    expect(deriveDeck(obj({ category: "nope" }))).toEqual([]);
  });
});

describe("correctness", () => {
  const round: SentenceRound = {
    prompt: "the cat is black",
    tiles: ["noir", "le", "est", "chat"], // scrambled
    answer: ["le", "chat", "est", "noir"],
  };

  it("builtWords resolves the chain through the tiles", () => {
    // tiles indices that spell the answer: le(1) chat(3) est(2) noir(0)
    expect(builtWords(round, [1, 3, 2, 0])).toEqual(["le", "chat", "est", "noir"]);
  });

  it("roundCorrect accepts the right word order and rejects wrong / incomplete", () => {
    expect(roundCorrect(round, [1, 3, 2, 0])).toBe(true);
    expect(roundCorrect(round, [0, 1, 2, 3])).toBe(false);
    expect(roundCorrect(round, [1, 3, 2])).toBe(false);
  });

  it("checks by produced words, so a repeated word still validates", () => {
    const r: SentenceRound = {
      prompt: "I have a red bag",
      tiles: ["le", "le", "chat"], // two identical tiles
      answer: ["le", "le", "chat"],
    };
    // Either identical tile in either of the first two slots is correct.
    expect(roundCorrect(r, [1, 0, 2])).toBe(true);
    expect(roundCorrect(r, [0, 1, 2])).toBe(true);
  });
});

describe("applyTap", () => {
  const round: SentenceRound = {
    prompt: "x",
    tiles: ["a", "b", "c"],
    answer: ["a", "b", "c"],
  };

  it("adds a tile, removes it on a second tap, and locks when full", () => {
    let out = applyTap(round, [], false, 0)!;
    expect(out.chain).toEqual([0]);
    expect(out.checked).toBe(false);
    // tap again to remove
    out = applyTap(round, [0], false, 0)!;
    expect(out.chain).toEqual([]);
    // fill up → locks and checks
    out = applyTap(round, [0, 1], false, 2)!;
    expect(out).toMatchObject({ chain: [0, 1, 2], checked: true, justChecked: true, correct: true });
  });

  it("returns null once checked (locked)", () => {
    expect(applyTap(round, [0, 1, 2], true, 0)).toBeNull();
  });
});

describe("session patches", () => {
  it("next advances the round", () => {
    expect(nextPatch(obj({ idx: 2 }))).toEqual({ idx: 3 });
  });

  it("readChain round-trips a stored chain", () => {
    const o = obj({ ["so:0"]: "2,0,1" });
    expect(readChain(o, 0)).toEqual([2, 0, 1]);
    expect(readChain(o, 5)).toEqual([]);
  });

  it("newDeck bumps round and clears responses", () => {
    const o = obj({ round: 1, idx: 3, ["so:0"]: "1,0", ["sc:0"]: 1 });
    const patch = newDeckPatch(o);
    expect(patch.round).toBe(2);
    expect(patch.idx).toBe(0);
    expect(patch["so:0"]).toBeUndefined();
    expect(patch["sc:0"]).toBeUndefined();
  });

  it("reset clears responses without touching round", () => {
    const o = obj({ round: 2, ["so:1"]: "0,1" });
    const patch = resetSessionPatch(o);
    expect(patch).not.toHaveProperty("round");
    expect(patch.idx).toBe(0);
    expect(patch["so:1"]).toBeUndefined();
  });
});

describe("misc", () => {
  it("clampRounds bounds and defaults", () => {
    expect(clampRounds(undefined)).toBe(DEFAULT_ROUNDS);
    expect(clampRounds(1)).toBe(MIN_ROUNDS);
    expect(clampRounds(99)).toBe(MAX_ROUNDS);
  });
});
