// The conjugation catalogue + resolver: tables are well-formed across tenses,
// past tenses are stored, the future is derived, and French elision reads right.

import { describe, expect, it } from "vitest";
import {
  PRONOUNS,
  TENSES,
  VERBS,
  conjugationFor,
  displayLine,
  promptPronoun,
  verbById,
  verbsFor,
} from "@/lang/conjugation";

const STORED = ["present", "imparfait", "passecompose"] as const;

describe("catalogue", () => {
  it("every verb has 6 rows for every stored tense in both languages", () => {
    for (const v of VERBS) {
      for (const code of ["fr", "en"]) {
        for (const tense of STORED) {
          const rows = v.forms[code]?.[tense];
          expect(rows, `${v.id}/${code}/${tense}`).toHaveLength(6);
          rows!.forEach((r) => {
            expect(r.pronoun).not.toBe("");
            expect(r.form).not.toBe("");
          });
        }
      }
    }
  });

  it("offers present, imparfait, passé composé and near future", () => {
    expect(TENSES.map((t) => t.id)).toEqual(["present", "imparfait", "passecompose", "future"]);
  });

  it("verb ids are unique", () => {
    const ids = VERBS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("conjugationFor", () => {
  it("returns the stored present, imperfect and perfect", () => {
    expect(conjugationFor("etre", "present", "fr").map((r) => r.form)[0]).toBe("suis");
    expect(conjugationFor("etre", "imparfait", "fr").map((r) => r.form)).toEqual(
      ["étais", "étais", "était", "étions", "étiez", "étaient"],
    );
    expect(conjugationFor("avoir", "passecompose", "fr")[0].form).toBe("ai eu");
  });

  it("derives the near future for both languages", () => {
    expect(conjugationFor("manger", "future", "fr")[0]).toEqual({ pronoun: "je", form: "vais manger" });
    expect(conjugationFor("manger", "future", "en")[0]).toEqual({ pronoun: "I", form: "will eat" });
  });

  it("English perfect uses has for the third person", () => {
    const rows = conjugationFor("manger", "passecompose", "en");
    expect(rows[0].form).toBe("have eaten");
    expect(rows[2].form).toBe("has eaten");
  });

  it("is empty for an unknown verb or tense", () => {
    expect(conjugationFor("nope", "present", "fr")).toEqual([]);
    expect(conjugationFor("etre", "nope", "fr")).toEqual([]);
  });
});

describe("elision", () => {
  it("displayLine elides je before a vowel", () => {
    expect(displayLine({ pronoun: "je", form: "suis" }, "fr")).toBe("je suis");
    expect(displayLine({ pronoun: "je", form: "ai" }, "fr")).toBe("j'ai");
    expect(displayLine({ pronoun: "je", form: "ai eu" }, "fr")).toBe("j'ai eu");
    expect(displayLine({ pronoun: "je", form: "étais" }, "fr")).toBe("j'étais");
  });

  it("promptPronoun gives j' (tight) before a vowel, je otherwise", () => {
    expect(promptPronoun({ pronoun: "je", form: "ai" }, "fr")).toEqual({ label: "j'", tight: true });
    expect(promptPronoun({ pronoun: "je", form: "suis" }, "fr")).toEqual({ label: "je", tight: false });
    expect(promptPronoun({ pronoun: "je", form: "vais aller" }, "fr")).toEqual({ label: "je", tight: false });
    // aller passé composé starts with a consonant → no elision
    expect(promptPronoun({ pronoun: "je", form: "suis allé" }, "fr")).toEqual({ label: "je", tight: false });
    // never elides in English
    expect(promptPronoun({ pronoun: "I", form: "am" }, "en")).toEqual({ label: "I", tight: false });
  });
});

describe("verbsFor", () => {
  it("filters by level and lists all at mixed", () => {
    expect(verbsFor("fr", "mixed").length).toBe(VERBS.length);
    const basic = verbsFor("fr", "basic");
    expect(basic.every((v) => v.level === "basic")).toBe(true);
    expect(basic.some((v) => v.id === "etre")).toBe(true);
  });

  it("has six subject pronouns per language", () => {
    expect(PRONOUNS.fr).toHaveLength(6);
    expect(PRONOUNS.en).toHaveLength(6);
    expect(verbById("etre")?.infinitive.fr).toBe("être");
  });
});
