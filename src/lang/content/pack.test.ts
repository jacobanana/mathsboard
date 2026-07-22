// The content-pack format, validator and registry: the base pack is valid, bad
// packs are rejected with useful messages, and importing / removing a pack adds
// to (and removes from) the live catalogue the widgets read.

import { afterEach, describe, expect, it } from "vitest";
import { CONTENT_SCHEMA, validatePack, type ContentPack } from "@/lang/content/schema";
import {
  BASE_PACK,
  currentContent,
  importPackJson,
  importedPacks,
  removeImportedPack,
} from "@/lang/content/registry";
import { LANGUAGES, VOCAB, SENTENCES, languageByCode } from "@/lang/data";
import { VERBS, PRONOUNS, conjugationFor } from "@/lang/conjugation";

/** A minimal, valid pack that adds Spanish + a word, sentence and verb. */
function spanishPack(id = "test-es"): ContentPack {
  return {
    formatVersion: 1,
    id,
    name: "Spanish test",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    ],
    categories: [{ id: "colours", label: "Colours", emoji: "🎨" }],
    pronouns: { es: ["yo", "tú", "él", "nosotros", "vosotros", "ellos"] },
    vocab: [{ category: "colours", level: "basic", terms: { en: "red", es: "rojo" } }],
    sentences: [{ category: "colours", level: "basic", terms: { en: "It is red.", es: "Es rojo." } }],
    verbs: [
      {
        id: "ser",
        level: "basic",
        infinitive: { en: "to be", es: "ser" },
        forms: {
          es: {
            present: ["soy", "eres", "es", "somos", "sois", "son"],
            past: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
            imperfect: ["era", "eras", "era", "éramos", "erais", "eran"],
            futureSimple: ["seré", "serás", "será", "seremos", "seréis", "serán"],
          },
        },
      },
    ],
  };
}

afterEach(() => {
  // Undo anything a test imported so the shared registry state stays clean.
  for (const p of [...importedPacks()]) removeImportedPack(p.id);
});

describe("validatePack", () => {
  it("accepts the built-in base pack", () => {
    expect(validatePack(BASE_PACK).ok).toBe(true);
  });

  it("accepts a well-formed pack", () => {
    expect(validatePack(spanishPack()).ok).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(validatePack(42).ok).toBe(false);
    expect(validatePack(null).ok).toBe(false);
  });

  it("requires formatVersion 1, a kebab id and a name", () => {
    const r = validatePack({ ...spanishPack(), formatVersion: 2, id: "Bad Id", name: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(" ")).toContain("formatVersion");
      expect(r.errors.join(" ")).toContain("id");
      expect(r.errors.join(" ")).toContain("name");
    }
  });

  it("rejects an unknown category on an item", () => {
    const pack = spanishPack();
    pack.vocab[0].category = "nope";
    const r = validatePack(pack);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("nope");
  });

  it("rejects a bad level", () => {
    const pack = spanishPack();
    (pack.vocab[0] as { level: string }).level = "hard";
    expect(validatePack(pack).ok).toBe(false);
  });

  it("rejects a verb tense that isn't six forms", () => {
    const pack = spanishPack();
    pack.verbs[0].forms.es.present = ["soy", "eres"];
    const r = validatePack(pack);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("present");
  });

  it("rejects pronouns that aren't six entries", () => {
    const pack = spanishPack();
    pack.pronouns.es = ["yo"];
    expect(validatePack(pack).ok).toBe(false);
  });
});

describe("importPackJson / registry", () => {
  it("rejects invalid JSON", () => {
    const r = importPackJson("{ not json");
    expect(r.ok).toBe(false);
  });

  it("reserves the id 'base'", () => {
    const r = importPackJson(JSON.stringify({ ...spanishPack("base") }));
    expect(r.ok).toBe(false);
  });

  it("adds a pack's languages, vocab, sentences and verbs to the live catalogue", () => {
    expect(languageByCode("es")).toBeUndefined();
    const r = importPackJson(JSON.stringify(spanishPack()));
    expect(r.ok).toBe(true);

    // data.ts arrays are mirrored in place.
    expect(languageByCode("es")?.name).toBe("Spanish");
    expect(LANGUAGES.some((l) => l.code === "es")).toBe(true);
    expect(VOCAB.some((v) => v.terms.es === "rojo")).toBe(true);
    expect(SENTENCES.some((s) => s.terms.es === "Es rojo.")).toBe(true);

    // conjugation.ts too — pronouns + a resolvable table.
    expect(PRONOUNS.es).toEqual(["yo", "tú", "él", "nosotros", "vosotros", "ellos"]);
    expect(VERBS.some((v) => v.id === "ser")).toBe(true);
    expect(conjugationFor("ser", "present", "es").map((row) => row.form)).toEqual([
      "soy", "eres", "es", "somos", "sois", "son",
    ]);
  });

  it("re-importing the same id replaces rather than duplicates", () => {
    importPackJson(JSON.stringify(spanishPack("dup")));
    const updated = spanishPack("dup");
    updated.name = "Renamed";
    const r = importPackJson(JSON.stringify(updated));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.replaced).toBe(true);
    expect(importedPacks().filter((p) => p.id === "dup")).toHaveLength(1);
    expect(importedPacks().find((p) => p.id === "dup")?.name).toBe("Renamed");
  });

  it("removing a pack drops its content again", () => {
    importPackJson(JSON.stringify(spanishPack()));
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(true);
    expect(removeImportedPack("test-es")).toBe(true);
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(false);
    expect(languageByCode("es")).toBeUndefined();
  });

  it("never lets an imported verb id shadow a built-in one", () => {
    const pack = spanishPack();
    pack.verbs[0].id = "etre"; // collides with a base verb id
    importPackJson(JSON.stringify(pack));
    // The built-in French "être" table still resolves (base wins on id clash).
    expect(conjugationFor("etre", "present", "fr").map((r) => r.form)).toEqual([
      "suis", "es", "est", "sommes", "êtes", "sont",
    ]);
  });
});

describe("CONTENT_SCHEMA", () => {
  it("is a draft-07 object schema naming the top-level fields", () => {
    expect(CONTENT_SCHEMA.$schema).toContain("draft-07");
    expect(CONTENT_SCHEMA.type).toBe("object");
    expect(Object.keys(CONTENT_SCHEMA.properties)).toEqual(
      expect.arrayContaining(["languages", "categories", "pronouns", "vocab", "sentences", "verbs"]),
    );
  });
});
