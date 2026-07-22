// The language catalogue + pair resolver: content is well-formed, pairs resolve
// only when BOTH languages have a word, and the defaults are usable.

import { describe, expect, it } from "vitest";
import { LANGUAGES, SENTENCE_SETS, TOPICS } from "@/lang/data";
import {
  defaultPair,
  isValidPair,
  pairLabel,
  sentencesForSet,
  usableSentenceSets,
  usableTopics,
  vocabForTopic,
} from "@/lang/pairs";

const EN_FR = { known: "en", learning: "fr" };

describe("catalogue", () => {
  it("ships at least English and French", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("fr");
  });

  it("every topic has a unique id and some items", () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOPICS) expect(t.items.length, t.id).toBeGreaterThan(0);
  });

  it("every sentence set has a unique id and some items", () => {
    const ids = SENTENCE_SETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SENTENCE_SETS) expect(s.items.length, s.id).toBeGreaterThan(0);
  });
});

describe("defaultPair / isValidPair", () => {
  it("defaults to a valid, distinct pair", () => {
    const p = defaultPair();
    expect(isValidPair(p)).toBe(true);
    expect(p.known).not.toBe(p.learning);
  });

  it("rejects same-language or unknown pairs", () => {
    expect(isValidPair({ known: "en", learning: "en" })).toBe(false);
    expect(isValidPair({ known: "en", learning: "zz" })).toBe(false);
  });

  it("labels a pair with both language names", () => {
    expect(pairLabel(EN_FR)).toBe("English → French");
  });
});

describe("vocabForTopic", () => {
  it("resolves both words for a known/learning pair", () => {
    const items = vocabForTopic("colours", EN_FR);
    expect(items.length).toBeGreaterThan(0);
    for (const v of items) {
      expect(typeof v.known).toBe("string");
      expect(typeof v.learning).toBe("string");
      expect(v.known).not.toBe("");
      expect(v.learning).not.toBe("");
    }
  });

  it("orients the pair correctly (English word vs French word)", () => {
    const red = vocabForTopic("colours", EN_FR).find((v) => v.known === "red");
    expect(red?.learning).toBe("rouge");
    // Reversing the pair swaps which side each word lands on.
    const rougeRev = vocabForTopic("colours", { known: "fr", learning: "en" }).find(
      (v) => v.known === "rouge",
    );
    expect(rougeRev?.learning).toBe("red");
  });

  it("is empty for an unknown topic", () => {
    expect(vocabForTopic("nope", EN_FR)).toEqual([]);
  });
});

describe("sentencesForSet", () => {
  it("resolves both translations", () => {
    const items = sentencesForSet("everyday", EN_FR);
    expect(items.length).toBeGreaterThan(0);
    for (const s of items) {
      expect(s.known).not.toBe("");
      expect(s.learning).not.toBe("");
    }
  });
});

describe("usable filters", () => {
  it("only offers topics/sets that have enough content for the pair", () => {
    const topics = usableTopics(EN_FR, 3);
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      expect(vocabForTopic(t.id, EN_FR).length).toBeGreaterThanOrEqual(3);
    }
    const sets = usableSentenceSets(EN_FR, 1);
    expect(sets.length).toBeGreaterThan(0);
  });
});
