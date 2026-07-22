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

describe("catalogue", () => {
  it("every verb has 6 present rows in both languages", () => {
    for (const v of VERBS) {
      for (const code of ["fr", "en"]) {
        const rows = v.present[code];
        expect(rows, `${v.id}/${code}`).toHaveLength(6);
        rows.forEach((r) => {
          expect(r.pronoun).not.toBe("");
          expect(r.form).not.toBe("");
        });
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

  it("derives the English future via will + base", () => {
    const rows = conjugationFor("manger", "future", "en");
    expect(rows[0]).toEqual({ pronoun: "I", form: "will eat" });
    expect(rows.every((r) => r.form === "will eat")).toBe(true);
  });

  it("is empty for an unknown verb or tense", () => {
    expect(conjugationFor("nope", "present", "fr")).toEqual([]);
    expect(conjugationFor("etre", "nope", "fr")).toEqual([]);
  });

  it("offers at least present and future tenses", () => {
    expect(TENSES.map((t) => t.id)).toEqual(expect.arrayContaining(["present", "future"]));
  });
});

describe("displayLine", () => {
  it("elides je before a vowel in French", () => {
    expect(displayLine({ pronoun: "je", form: "suis" }, "fr")).toBe("je suis");
    expect(displayLine({ pronoun: "je", form: "ai" }, "fr")).toBe("j'ai");
    expect(displayLine({ pronoun: "je", form: "aime" }, "fr")).toBe("j'aime");
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
