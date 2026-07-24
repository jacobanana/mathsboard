// The "where is it?" engine: rounds are deterministic, options always contain
// the answer, marking is lenient, and the session patches advance / reset as
// expected. Drives the built-in English→French prepositions loaded into the
// catalogue at import.

import { describe, expect, it } from "vitest";
import { prepositionsFor } from "@/lang/pairs";
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  clampRounds,
  deriveDeck,
  isChecked,
  isRoundCorrect,
  newDeckPatch,
  nextPatch,
  normalize,
  readAnswer,
  replayPatch,
  scoreCount,
  scoreDeck,
  setAnswerPatch,
  verdict,
  type PrepObj,
} from "@/tools/langprep/prep";
import { PREP_POSITIONS } from "@/lang/content/schema";

const obj = (over: Partial<PrepObj> = {}): PrepObj => ({
  id: "p-1",
  known: "en",
  learning: "fr",
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
    expect(a.map((r) => r.answer)).not.toEqual(b.map((r) => r.answer));
  });

  it("every round's options include the answer and a drawable position", () => {
    for (const r of deriveDeck(obj({ rounds: MAX_ROUNDS }))) {
      expect(r.options).toContain(r.answer);
      expect(PREP_POSITIONS).toContain(r.position);
      expect(r.emoji).toBeTruthy();
    }
  });

  it("rounds are bounded by MIN/MAX and how many prepositions exist", () => {
    const available = prepositionsFor({ known: "en", learning: "fr" }).length;
    expect(deriveDeck(obj({ rounds: 99 })).length).toBeLessThanOrEqual(
      Math.min(MAX_ROUNDS, available),
    );
  });
});

describe("marking", () => {
  it("is case- and accent-insensitive", () => {
    expect(normalize("À côté DE")).toBe(normalize("à côté de"));
    const r = deriveDeck(obj())[0];
    expect(isRoundCorrect(r, r.answer.toUpperCase())).toBe(true);
  });

  it("a different word is wrong", () => {
    const r = deriveDeck(obj())[0];
    const other = r.options.find((o) => normalize(o) !== normalize(r.answer));
    if (other) expect(isRoundCorrect(r, other)).toBe(false);
  });
});

describe("responses + scoring", () => {
  it("setAnswer + check records and reads an answer", () => {
    const o = obj({ ...setAnswerPatch(0, "sur"), "pc:0": 1 });
    expect(readAnswer(o, 0)).toBe("sur");
    expect(isChecked(o, 0)).toBe(true);
  });

  it("scoreDeck counts only checked, correct rounds", () => {
    const deck = deriveDeck(obj());
    const patch: Record<string, unknown> = {};
    deck.forEach((r, i) => {
      patch[`pa:${i}`] = r.answer;
      patch[`pc:${i}`] = 1;
    });
    const o = obj({ ...patch });
    const scored = scoreDeck(o, deck);
    expect(scoreCount(scored)).toBe(deck.length);
    // An unchecked-but-right answer doesn't count.
    const o2 = obj({ [`pa:0`]: deck[0].answer });
    expect(scoreCount(scoreDeck(o2, deck))).toBe(0);
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

  it("replay resets the index and clears answers, keeping the deck", () => {
    const o = obj({ round: 1, idx: 3, "pa:0": "sur", "pc:0": 1 });
    const patch = replayPatch(o);
    expect(patch.idx).toBe(0);
    expect(patch["pa:0"]).toBeUndefined();
    expect(patch).not.toHaveProperty("round");
  });

  it("newDeck bumps round and clears answers", () => {
    const o = obj({ round: 1, idx: 3, "pa:0": "sur", "pc:0": 1 });
    const patch = newDeckPatch(o);
    expect(patch.round).toBe(2);
    expect(patch.idx).toBe(0);
    expect(patch["pa:0"]).toBeUndefined();
  });

  it("clampRounds bounds and defaults", () => {
    expect(clampRounds(undefined)).toBe(DEFAULT_ROUNDS);
    expect(clampRounds(1)).toBe(MIN_ROUNDS);
    expect(clampRounds(99)).toBe(MAX_ROUNDS);
  });
});

describe("content gate", () => {
  it("French has enough prepositions to play", () => {
    expect(prepositionsFor({ known: "en", learning: "fr" }).length).toBeGreaterThanOrEqual(
      MIN_ROUNDS,
    );
  });
});
