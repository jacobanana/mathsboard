// The conjugation catalogue + resolver: tables are well-formed, present is
// stored and future is derived, and French elision reads correctly.

import { describe, expect, it } from "vitest";
import {
  PRONOUNS,
  TENSES,
  VERBS,
  conjugationFor,
  displayLine,
  verbById,
  verbsFor,
} from "@/lang/conjugation";

const STORED_TENSES = ["present", "past", "imperfect", "futureSimple"] as const;

describe("catalogue", () => {
  it("every verb stores 6 forms for every stored tense in both languages", () => {
    for (const v of VERBS) {
      for (const code of ["fr", "en"]) {
        for (const tense of STORED_TENSES) {
          const forms = v.forms[code][tense];
          expect(forms, `${v.id}/${code}/${tense}`).toHaveLength(6);
          forms.forEach((f) => expect(f.trim(), `${v.id}/${code}/${tense}`).not.toBe(""));
        }
      }
    }
  });

  it("verb ids are unique", () => {
    const ids = VERBS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("conjugationFor", () => {
  it("returns the stored present tense", () => {
    const rows = conjugationFor("etre", "present", "fr");
    expect(rows.map((r) => r.form)).toEqual(["suis", "es", "est", "sommes", "êtes", "sont"]);
  });

  it("derives the French near future via aller + infinitive", () => {
    const rows = conjugationFor("manger", "future", "fr");
    expect(rows[0]).toEqual({ pronoun: "je", form: "vais manger" });
    expect(rows[3]).toEqual({ pronoun: "nous", form: "allons manger" });
  });

  it("derives the English near future via going to + base", () => {
    const rows = conjugationFor("manger", "future", "en");
    expect(rows[0]).toEqual({ pronoun: "I", form: "am going to eat" });
    expect(rows[2]).toEqual({ pronoun: "he", form: "is going to eat" });
    expect(rows[3]).toEqual({ pronoun: "we", form: "are going to eat" });
  });

  it("returns the stored passé composé, imperfect and simple future", () => {
    expect(conjugationFor("avoir", "past", "fr").map((r) => r.form)).toEqual([
      "ai eu", "as eu", "a eu", "avons eu", "avez eu", "ont eu",
    ]);
    expect(conjugationFor("etre", "imperfect", "fr")[0].form).toBe("étais");
    expect(conjugationFor("aller", "futureSimple", "fr").map((r) => r.form)).toEqual([
      "irai", "iras", "ira", "irons", "irez", "iront",
    ]);
  });

  it("is empty for an unknown verb or tense", () => {
    expect(conjugationFor("nope", "present", "fr")).toEqual([]);
    expect(conjugationFor("etre", "nope", "fr")).toEqual([]);
  });

  it("offers present, both past tenses and both futures", () => {
    expect(TENSES.map((t) => t.id)).toEqual(
      expect.arrayContaining(["present", "past", "imperfect", "future", "futureSimple"]),
    );
  });
});

describe("displayLine", () => {
  it("elides je before a vowel in French", () => {
    expect(displayLine({ pronoun: "je", form: "suis" }, "fr")).toBe("je suis");
    expect(displayLine({ pronoun: "je", form: "ai" }, "fr")).toBe("j'ai");
    expect(displayLine({ pronoun: "je", form: "aime" }, "fr")).toBe("j'aime");
    // Elision also applies to the compound past ("j'ai mangé").
    expect(displayLine({ pronoun: "je", form: "ai mangé" }, "fr")).toBe("j'ai mangé");
  });

  it("does not elide in English", () => {
    expect(displayLine({ pronoun: "I", form: "am" }, "en")).toBe("I am");
  });
});

describe("verbsFor", () => {
  it("filters by level and lists all at mixed", () => {
    expect(verbsFor("fr", "mixed").length).toBe(VERBS.length);
    const basic = verbsFor("fr", "basic");
    expect(basic.length).toBeGreaterThan(0);
    expect(basic.every((v) => v.level === "basic")).toBe(true);
    expect(basic.some((v) => v.id === "etre")).toBe(true);
  });

  it("has six subject pronouns per language", () => {
    expect(PRONOUNS.fr).toHaveLength(6);
    expect(PRONOUNS.en).toHaveLength(6);
    expect(verbById("etre")?.infinitive.fr).toBe("être");
  });
});
