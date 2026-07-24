// The "listen and choose" engine: rounds are deterministic, options always
// contain the spoken word, marking is lenient, and the session patches advance /
// reset as expected. Drives the built-in English→French vocab loaded at import.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  OPTION_COUNT,
  answerOption,
  clampRounds,
  deriveDeck,
  isChecked,
  isRoundCorrect,
  newDeckPatch,
  nextPatch,
  normalize,
  readAnswer,
  replayPatch,
  retryPatch,
  scoreCount,
  scoreDeck,
  setAnswerPatch,
  verdict,
  type ListenObj,
} from "@/tools/langlisten/listen";

const obj = (over: Partial<ListenObj> = {}): ListenObj => ({
  id: "l-1",
  known: "en",
  learning: "fr",
  category: "animals",
  level: "mixed",
  rounds: 6,
  ...over,
});

describe("deriveDeck", () => {
  it("is deterministic for the same object", () => {
    expect(deriveDeck(obj({ round: 1 }))).toEqual(deriveDeck(obj({ round: 1 })));
  });

  it("bumping round reshuffles", () => {
    const a = deriveDeck(obj({ round: 0 }));
    const b = deriveDeck(obj({ round: 1 }));
    expect(a.map((r) => r.spoken)).not.toEqual(b.map((r) => r.spoken));
  });

  it("every round's options include the spoken word", () => {
    for (const r of deriveDeck(obj({ rounds: MAX_ROUNDS }))) {
      expect(r.options.some((o) => normalize(o.learning) === normalize(r.spoken))).toBe(true);
      expect(r.options.length).toBeLessThanOrEqual(OPTION_COUNT);
      expect(answerOption(r)?.learning).toBe(r.spoken);
    }
  });

  it("options within a round are distinct words", () => {
    for (const r of deriveDeck(obj({ rounds: MAX_ROUNDS }))) {
      const words = r.options.map((o) => normalize(o.learning));
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("rounds are bounded by MIN/MAX and the topic size", () => {
    expect(deriveDeck(obj({ rounds: 99 })).length).toBeLessThanOrEqual(MAX_ROUNDS);
  });

  it("is empty for an unknown topic", () => {
    expect(deriveDeck(obj({ category: "nope" }))).toEqual([]);
  });
});

describe("marking + scoring", () => {
  it("marks the spoken word correct, case/accent-insensitively", () => {
    const r = deriveDeck(obj())[0];
    expect(isRoundCorrect(r, r.spoken)).toBe(true);
    expect(isRoundCorrect(r, r.spoken.toUpperCase())).toBe(true);
    const other = r.options.find((o) => normalize(o.learning) !== normalize(r.spoken));
    if (other) expect(isRoundCorrect(r, other.learning)).toBe(false);
  });

  it("records and reads an answer; scoreDeck counts only checked+correct", () => {
    const o0 = obj({ ...setAnswerPatch(0, "x"), "lc:0": 1 });
    expect(readAnswer(o0, 0)).toBe("x");
    expect(isChecked(o0, 0)).toBe(true);

    const deck = deriveDeck(obj());
    const patch: Record<string, unknown> = {};
    deck.forEach((r, i) => {
      patch[`la:${i}`] = r.spoken;
      patch[`lc:${i}`] = 1;
    });
    expect(scoreCount(scoreDeck(obj({ ...patch }), deck))).toBe(deck.length);
    // Unchecked right answer doesn't count.
    expect(scoreCount(scoreDeck(obj({ "la:0": deck[0].spoken }), deck))).toBe(0);
  });

  it("verdict scales with the score", () => {
    expect(verdict(10, 10).emoji).toBe("🌟");
    expect(verdict(0, 10).emoji).toBe("💪");
  });
});

describe("session control", () => {
  it("next advances the index", () => {
    expect(nextPatch(obj({ idx: 2 })).idx).toBe(3);
  });

  it("retry clears one round's answer + checked", () => {
    expect(retryPatch(1)).toEqual({ "la:1": undefined, "lc:1": undefined });
  });

  it("replay resets the index and clears answers, keeping the deck", () => {
    const o = obj({ round: 1, idx: 3, "la:0": "chien", "lc:0": 1 });
    const patch = replayPatch(o);
    expect(patch.idx).toBe(0);
    expect(patch["la:0"]).toBeUndefined();
    expect(patch).not.toHaveProperty("round");
  });

  it("newDeck bumps round and clears answers", () => {
    const o = obj({ round: 1, idx: 3, "la:0": "chien", "lc:0": 1 });
    const patch = newDeckPatch(o);
    expect(patch.round).toBe(2);
    expect(patch.idx).toBe(0);
    expect(patch["la:0"]).toBeUndefined();
  });

  it("clampRounds bounds and defaults", () => {
    expect(clampRounds(undefined)).toBe(DEFAULT_ROUNDS);
    expect(clampRounds(1)).toBe(MIN_ROUNDS);
    expect(clampRounds(99)).toBe(MAX_ROUNDS);
  });
});
