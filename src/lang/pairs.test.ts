// The language catalogue + pair/category/level resolver: content is well-formed,
// pairs resolve only when BOTH languages have a word, the level filter works,
// and the defaults are usable.

import { describe, expect, it } from "vitest";
import { CATEGORIES, LANGUAGES, LEVELS, SENTENCES, VOCAB } from "@/lang/data";
import {
  categoriesForSentences,
  categoriesForVocab,
  defaultPair,
  isValidPair,
  levelsForVocabCategory,
  pairLabel,
  resolveLevel,
  sentencesFor,
  vocabFor,
} from "@/lang/pairs";

const EN_FR = { known: "en", learning: "fr" };
const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));

describe("catalogue", () => {
  it("ships at least English and French", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("fr");
  });

  it("categories have unique ids", () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every vocab item has a known category, a valid level and both terms", () => {
    for (const item of VOCAB) {
      expect(CAT_IDS.has(item.category), item.terms.en).toBe(true);
      expect(LEVELS, item.terms.en).toContain(item.level);
      expect(item.terms.en?.length, JSON.stringify(item)).toBeGreaterThan(0);
      expect(item.terms.fr?.length, JSON.stringify(item)).toBeGreaterThan(0);
    }
  });

  it("every sentence has a known category, a valid level and both terms", () => {
    for (const item of SENTENCES) {
      expect(CAT_IDS.has(item.category), item.terms.en).toBe(true);
      expect(LEVELS, item.terms.en).toContain(item.level);
      expect(item.terms.en?.length, JSON.stringify(item)).toBeGreaterThan(0);
      expect(item.terms.fr?.length, JSON.stringify(item)).toBeGreaterThan(0);
    }
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

describe("vocabFor", () => {
  it("resolves both words, mixed returns every level", () => {
    const items = vocabFor("colours", "mixed", EN_FR);
    expect(items.length).toBeGreaterThan(0);
    for (const v of items) {
      expect(v.known).not.toBe("");
      expect(v.learning).not.toBe("");
    }
  });

  it("filters by level", () => {
    const basic = vocabFor("colours", "basic", EN_FR);
    const mixed = vocabFor("colours", "mixed", EN_FR);
    expect(basic.length).toBeGreaterThan(0);
    expect(basic.length).toBeLessThan(mixed.length); // basic ⊂ mixed
    // a known basic colour is present at basic, an advanced one is not
    expect(basic.some((v) => v.known === "red")).toBe(true);
    expect(basic.some((v) => v.known === "gold")).toBe(false);
    expect(vocabFor("colours", "advanced", EN_FR).some((v) => v.known === "gold")).toBe(true);
  });

  it("orients the pair (English → French) and reverses", () => {
    const red = vocabFor("colours", "mixed", EN_FR).find((v) => v.known === "red");
    expect(red?.learning).toBe("rouge");
    const rev = vocabFor("colours", "mixed", { known: "fr", learning: "en" }).find(
      (v) => v.known === "rouge",
    );
    expect(rev?.learning).toBe("red");
  });

  it("is empty for an unknown category", () => {
    expect(vocabFor("nope", "mixed", EN_FR)).toEqual([]);
  });
});

describe("sentencesFor", () => {
  it("resolves both translations and filters by level", () => {
    const mixed = sentencesFor("greetings", "mixed", EN_FR);
    const basic = sentencesFor("greetings", "basic", EN_FR);
    expect(mixed.length).toBeGreaterThan(0);
    expect(basic.length).toBeGreaterThan(0);
    expect(basic.length).toBeLessThanOrEqual(mixed.length);
    for (const s of mixed) {
      expect(s.known).not.toBe("");
      expect(s.learning).not.toBe("");
    }
  });
});

describe("category / level helpers", () => {
  it("categoriesForVocab only offers themes with enough content", () => {
    const cats = categoriesForVocab(EN_FR, "mixed", 3);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(vocabFor(c.id, "mixed", EN_FR).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("categoriesForSentences offers themes with sentences", () => {
    const cats = categoriesForSentences(EN_FR, "mixed", 1);
    expect(cats.some((c) => c.id === "confidence")).toBe(true);
  });

  it("levelsForVocabCategory lists only non-empty levels, in order", () => {
    const levels = levelsForVocabCategory("colours", EN_FR);
    expect(levels).toContain("basic");
    // ordered subset of LEVELS
    expect(levels).toEqual(LEVELS.filter((l) => levels.includes(l)));
  });

  it("resolveLevel keeps a valid level, snaps an invalid one, passes mixed", () => {
    expect(resolveLevel(["basic", "medium"], "basic")).toBe("basic");
    expect(resolveLevel(["medium", "advanced"], "basic")).toBe("medium");
    expect(resolveLevel([], "basic")).toBe("mixed");
    expect(resolveLevel(["basic"], "mixed")).toBe("mixed");
  });
});
