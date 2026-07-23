// The language catalogue + pair/category/level resolver: content is well-formed,
// pairs resolve only when BOTH languages have a word, the level filter works,
// and the defaults are usable.

import { afterEach, describe, expect, it } from "vitest";
import { CATEGORIES, LANGUAGES, LEVELS, SENTENCES, VOCAB } from "@/lang/data";
import { importPackJson, removeImportedPack, setBaseActive } from "@/lang/content/registry";
import {
  categoriesForSentences,
  categoriesForVocab,
  categoriesFromObj,
  categoriesLabel,
  defaultPair,
  isValidPair,
  levelsForVocabCategories,
  levelsForVocabCategory,
  pairLabel,
  resolveLevel,
  sentencesFor,
  sentencesForCategories,
  vocabFor,
  vocabForCategories,
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

describe("several themes at once", () => {
  it("vocabForCategories concatenates the chosen themes and dedupes", () => {
    const colours = vocabFor("colours", "mixed", EN_FR);
    const animals = vocabFor("animals", "mixed", EN_FR);
    const both = vocabForCategories(["colours", "animals"], "mixed", EN_FR);
    // Union of the two themes, deduped by known+learning.
    const keys = new Set(both.map((v) => v.known + " " + v.learning));
    expect(both.length).toBe(keys.size);
    expect(both.length).toBeGreaterThanOrEqual(Math.max(colours.length, animals.length));
    expect(both.some((v) => v.known === "red")).toBe(true);
    // A single theme resolves the same as the singular helper.
    expect(vocabForCategories(["colours"], "mixed", EN_FR)).toEqual(colours);
  });

  it("sentencesForCategories merges sentence themes", () => {
    const both = sentencesForCategories(["greetings", "confidence"], "mixed", EN_FR);
    const greetings = sentencesFor("greetings", "mixed", EN_FR);
    expect(both.length).toBeGreaterThan(greetings.length);
  });

  it("levelsForVocabCategories is the union of each theme's levels", () => {
    const union = levelsForVocabCategories(["colours", "animals"], EN_FR);
    expect(union).toContain("basic");
    expect(union).toEqual(LEVELS.filter((l) => union.includes(l)));
  });
});

describe("categoriesFromObj / categoriesLabel", () => {
  it("prefers `categories`, falls back to a single legacy field", () => {
    expect(categoriesFromObj({ categories: ["colours", "animals"] })).toEqual([
      "colours",
      "animals",
    ]);
    expect(categoriesFromObj({ category: "food" })).toEqual(["food"]);
    expect(categoriesFromObj({ topic: "food" })).toEqual(["food"]);
    expect(categoriesFromObj({ set: "greetings" })).toEqual(["greetings"]);
    // An empty `categories` array falls through to the legacy field.
    expect(categoriesFromObj({ categories: [], category: "food" })).toEqual(["food"]);
    expect(categoriesFromObj({})).toEqual([]);
  });

  it("labels one theme by name and several compactly", () => {
    expect(categoriesLabel(["colours"])).toBe("Colours");
    expect(categoriesLabel(["colours", "animals"])).toBe("Colours & Animals");
    expect(categoriesLabel(["colours", "animals", "food"])).toBe("Colours +2");
    expect(categoriesLabel([], "Vocabulary")).toBe("Vocabulary");
  });
});

describe("phonetics threading", () => {
  // A Japanese pack that carries readings only on the taught side — exactly the
  // shape that fixes text-to-speech (the reading lives beside the term, not in
  // it). Imported live so the resolver runs against the real catalogue.
  const jaPack = {
    formatVersion: 1,
    id: "test-ja-phon",
    name: "Japanese phonetics test",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
    ],
    categories: [{ id: "greetings", label: "Greetings", emoji: "👋" }],
    pronouns: {},
    vocab: [
      {
        category: "greetings",
        level: "basic",
        terms: { en: "hello", ja: "こんにちは" },
        phonetics: { ja: "konnichiwa" },
      },
    ],
    sentences: [
      {
        category: "greetings",
        level: "basic",
        terms: { en: "Good morning!", ja: "おはよう！" },
        phonetics: { ja: "ohayō" },
      },
    ],
    verbs: [],
  };

  afterEach(() => {
    removeImportedPack("test-ja-phon");
    setBaseActive(true);
  });

  it("carries the reading onto the resolved learning side, and leaves it undefined where absent", () => {
    expect(importPackJson(JSON.stringify(jaPack)).ok).toBe(true);
    const pair = { known: "en", learning: "ja" };

    const hello = vocabFor("greetings", "mixed", pair).find((v) => v.learning === "こんにちは");
    expect(hello?.learningPhonetic).toBe("konnichiwa");
    expect(hello?.knownPhonetic).toBeUndefined(); // English needs no reading

    const morning = sentencesFor("greetings", "mixed", pair).find(
      (s) => s.learning === "おはよう！",
    );
    expect(morning?.learningPhonetic).toBe("ohayō");
  });

  it("orients the reading with the pair (reading follows Japanese when it is the known side)", () => {
    expect(importPackJson(JSON.stringify(jaPack)).ok).toBe(true);
    const rev = vocabFor("greetings", "mixed", { known: "ja", learning: "en" }).find(
      (v) => v.known === "こんにちは",
    );
    expect(rev?.knownPhonetic).toBe("konnichiwa");
    expect(rev?.learningPhonetic).toBeUndefined();
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
