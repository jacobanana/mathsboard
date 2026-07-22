// The fill-the-gaps engine: rounds are deterministic, one real word is blanked,
// the options include the answer, comparison is lenient, and patches behave.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  affixes,
  clampRounds,
  core,
  deriveDeck,
  isRoundCorrect,
  newDeckPatch,
  normalize,
  readAnswer,
  resetSessionPatch,
  setAnswerPatch,
  type GapObj,
} from "@/tools/langgaps/gaps";

const obj = (over: Partial<GapObj> = {}): GapObj => ({
  id: "g-1",
  known: "en",
  learning: "fr",
  category: "greetings",
  level: "mixed",
  difficulty: "pick",
  rounds: 6,
  ...over,
});

describe("helpers", () => {
  it("core strips surrounding punctuation", () => {
    expect(core("noir.")).toBe("noir");
    expect(core("?")).toBe("");
    expect(core("l'école")).toBe("l'école");
  });

  it("affixes split lead/trail around the core", () => {
    expect(affixes("table.")).toEqual({ lead: "", trail: "." });
    expect(affixes("?")).toEqual({ lead: "", trail: "?" });
  });

  it("normalize is case- and accent-insensitive", () => {
    expect(normalize("Être")).toBe(normalize("etre"));
    expect(normalize(" OUI ")).toBe("oui");
  });
});

describe("deriveDeck", () => {
  it("is deterministic and reshuffles on a new round", () => {
    expect(deriveDeck(obj({ round: 1 }))).toEqual(deriveDeck(obj({ round: 1 })));
    expect(deriveDeck(obj({ round: 0 }))).not.toEqual(deriveDeck(obj({ round: 1 })));
  });

  it("blanks a real word and offers options including the answer", () => {
    for (const r of deriveDeck(obj({ rounds: MAX_ROUNDS }))) {
      expect(r.gapIndex).toBeGreaterThanOrEqual(0);
      expect(r.answer.length).toBeGreaterThanOrEqual(2);
      expect(r.answer).toBe(core(r.tokens[r.gapIndex]));
      expect(r.options).toContain(r.answer);
      expect(r.options.length).toBeGreaterThanOrEqual(1);
      // no duplicate options
      expect(new Set(r.options.map(normalize)).size).toBe(r.options.length);
    }
  });

  it("is empty for an unknown category", () => {
    expect(deriveDeck(obj({ category: "nope" }))).toEqual([]);
  });
});

describe("correctness + patches", () => {
  it("isRoundCorrect matches leniently", () => {
    const round = deriveDeck(obj({ round: 2 }))[0];
    expect(isRoundCorrect(round, round.answer)).toBe(true);
    expect(isRoundCorrect(round, round.answer.toUpperCase())).toBe(true);
    expect(isRoundCorrect(round, "zzzz")).toBe(false);
  });

  it("setAnswer stores / clears, readAnswer reads", () => {
    const o = obj({ ...setAnswerPatch(0, "oui") });
    expect(readAnswer(o, 0)).toBe("oui");
    expect(setAnswerPatch(1, "")).toEqual({ "ga:1": undefined });
  });

  it("newDeck bumps round + clears; reset keeps round", () => {
    const o = obj({ round: 1, idx: 3, ["ga:0"]: "x", ["gc:0"]: 1 });
    const nd = newDeckPatch(o);
    expect(nd.round).toBe(2);
    expect(nd["ga:0"]).toBeUndefined();
    const rs = resetSessionPatch(o);
    expect(rs).not.toHaveProperty("round");
    expect(rs.idx).toBe(0);
  });

  it("clampRounds bounds and defaults", () => {
    expect(clampRounds(undefined)).toBe(DEFAULT_ROUNDS);
    expect(clampRounds(1)).toBe(MIN_ROUNDS);
    expect(clampRounds(99)).toBe(MAX_ROUNDS);
  });
});
