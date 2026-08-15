// The content-pack format, validator and registry: the base pack is valid, bad
// packs are rejected with useful messages, and importing / removing a pack adds
// to (and removes from) the live catalogue the widgets read.

import { afterEach, describe, expect, it } from "vitest";
import {
  CONTENT_SCHEMA,
  CONTENT_SCHEMA_PATH,
  validatePack,
  type ContentPack,
} from "@/lang/content/schema";
import {
  BASE_PACK,
  activePackIds,
  canDisableBase,
  currentContent,
  importPackJson,
  importedPacks,
  isBaseActive,
  isPackActive,
  removeImportedPack,
  setBaseActive,
  setPackActive,
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

/** Load a pack into the library AND switch it on. Loading alone only adds a
 *  pack to the library now — what teaches is the open board's declared choice
 *  (see content/boardContent.ts) — so tests about the live catalogue say so. */
function load(pack: ContentPack | Record<string, unknown>): void {
  const r = importPackJson(JSON.stringify(pack));
  expect(r.ok).toBe(true);
  if (r.ok) setPackActive(r.pack.id, true);
}

afterEach(() => {
  // Undo anything a test imported so the shared registry state stays clean.
  for (const p of [...importedPacks()]) removeImportedPack(p.id);
  setBaseActive(true); // restore the default in case a test switched base off
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

  it("accepts optional phonetics on vocab and sentences", () => {
    const pack = spanishPack();
    pack.vocab[0].phonetics = { es: "rojo" };
    pack.sentences[0].phonetics = { es: "es rojo" };
    expect(validatePack(pack).ok).toBe(true);
  });

  it("rejects malformed phonetics (empty reading or wrong shape)", () => {
    const bad = spanishPack();
    bad.vocab[0].phonetics = { es: "" };
    const r1 = validatePack(bad);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.join(" ")).toContain("phonetics");

    const bad2 = spanishPack();
    (bad2.vocab[0] as { phonetics: unknown }).phonetics = "rojo";
    expect(validatePack(bad2).ok).toBe(false);
  });

  it("accepts optional article on vocab, rejects an empty one", () => {
    const ok = spanishPack();
    ok.vocab[0].article = { es: "el" };
    expect(validatePack(ok).ok).toBe(true);

    const bad = spanishPack();
    bad.vocab[0].article = { es: "" };
    const r = validatePack(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("article");
  });

  it("accepts a valid prepositions array", () => {
    const pack = spanishPack();
    pack.prepositions = [
      { terms: { en: "on", es: "sobre" }, position: "on" },
      { terms: { en: "under", es: "debajo de" }, position: "under" },
    ];
    expect(validatePack(pack).ok).toBe(true);
  });

  it("rejects a preposition with an unknown position or missing terms", () => {
    const bad = spanishPack();
    (bad as ContentPack).prepositions = [
      { terms: { en: "on", es: "sobre" }, position: "nope" as unknown as "on" },
    ];
    const r1 = validatePack(bad);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.join(" ")).toContain("position");

    const bad2 = spanishPack();
    (bad2 as ContentPack).prepositions = [
      { terms: {}, position: "on" },
    ];
    expect(validatePack(bad2).ok).toBe(false);
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
    load(spanishPack());

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
    load(spanishPack());
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(true);
    expect(removeImportedPack("test-es")).toBe(true);
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(false);
    expect(languageByCode("es")).toBeUndefined();
  });

  it("never lets an imported verb id shadow a built-in one", () => {
    // A same-language (English↔French) pack so it stays combined with base; its
    // verb reuses a base id to prove base wins the clash rather than being hidden.
    const forms = ["x", "x", "x", "x", "x", "x"];
    const pack: ContentPack = {
      formatVersion: 1,
      id: "clash",
      name: "Clash",
      languages: [
        { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
        { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
      ],
      categories: [{ id: "colours", label: "Colours", emoji: "🎨" }],
      pronouns: {},
      vocab: [],
      sentences: [],
      verbs: [
        {
          id: "etre", // collides with a base verb id
          level: "basic",
          infinitive: { en: "to be", fr: "être" },
          forms: { fr: { present: forms, past: forms, imperfect: forms, futureSimple: forms } },
        },
      ],
    };
    importPackJson(JSON.stringify(pack));
    // The built-in French "être" table still resolves (base wins on id clash).
    expect(conjugationFor("etre", "present", "fr").map((r) => r.form)).toEqual([
      "suis", "es", "est", "sommes", "êtes", "sont",
    ]);
  });
});

describe("active-pack selection", () => {
  /** A second English↔French pack (same languages as base) — so it combines. */
  function frenchPack(id: string): ContentPack {
    return {
      ...spanishPack(id),
      name: "French test",
      languages: [
        { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
        { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
      ],
      vocab: [{ category: "colours", level: "basic", terms: { en: "red", fr: "rouge" } }],
      verbs: [],
    };
  }

  /** A second English↔Spanish pack with a distinct word, so two same-language
   *  packs can be told apart when combined. */
  function spanishPackBlue(id: string): ContentPack {
    return {
      ...spanishPack(id),
      vocab: [{ category: "colours", level: "basic", terms: { en: "blue", es: "azul" } }],
      verbs: [],
    };
  }

  /** A second pack adding German + a distinct word, so we can tell packs apart. */
  function germanPack(id = "test-de"): ContentPack {
    return {
      formatVersion: 1,
      id,
      name: "German test",
      languages: [
        { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
        { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
      ],
      categories: [{ id: "colours", label: "Colours", emoji: "🎨" }],
      pronouns: {},
      vocab: [{ category: "colours", level: "basic", terms: { en: "red", de: "rot" } }],
      sentences: [],
      verbs: [],
    };
  }

  it("loading a pack adds it to the library without switching it on", () => {
    // Loading content must not silently change what the open board teaches —
    // that is the board's own declared choice. It used to, which is how loading
    // a second pack for the same languages dropped the first.
    importPackJson(JSON.stringify(spanishPack("a")));
    importPackJson(JSON.stringify(germanPack("b")));
    expect(importedPacks().map((p) => p.id)).toEqual(["a", "b"]);
    expect(activePackIds()).toEqual([]);
    expect(isBaseActive()).toBe(true);
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(false);
    expect(currentContent().vocab.some((v) => v.terms.de === "rot")).toBe(false);
  });

  it("keeps base combined with a same-language import but drops it for a different one", () => {
    // A same-language import (English↔French) stays combined with the base pack.
    load(frenchPack("fr2"));
    expect(isBaseActive()).toBe(true);
    expect(currentContent().languages.some((l) => l.code === "fr")).toBe(true);
    removeImportedPack("fr2");
    // A different-language import (English↔Spanish) switches base off, so the
    // board isn't left mixing English↔French with English↔Spanish content.
    load(spanishPack("es"));
    expect(isBaseActive()).toBe(false);
    expect(currentContent().languages.some((l) => l.code === "fr")).toBe(false);
    expect(currentContent().languages.some((l) => l.code === "es")).toBe(true);
  });

  it("combines several packs that teach the SAME languages", () => {
    load(spanishPack("a"));
    load(spanishPackBlue("b")); // both English↔Spanish — they combine
    expect(activePackIds().sort()).toEqual(["a", "b"]);
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(true);
    expect(currentContent().vocab.some((v) => v.terms.es === "azul")).toBe(true);
  });

  it("won't combine packs of different languages — switching one on drops the other", () => {
    load(spanishPack("a")); // English↔Spanish
    load(germanPack("b")); // English↔German — different languages, so it replaces
    setPackActive("a", true); // …and switching Spanish back on drops German again
    expect(activePackIds()).toEqual(["a"]);
    expect(isPackActive("b")).toBe(false);
    // The base pack (English↔French) can't join a different-language selection either.
    expect(isBaseActive()).toBe(false);
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(true);
    expect(currentContent().vocab.some((v) => v.terms.de === "rot")).toBe(false);
  });

  it("switching a pack off drops its content without removing it", () => {
    load(spanishPack("a"));
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(true);
    setPackActive("a", false);
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(false);
    // Still in the library, just inactive.
    expect(importedPacks().some((p) => p.id === "a")).toBe(true);
    expect(isPackActive("a")).toBe(false);
  });

  it("removing a pack takes it out of the active set", () => {
    load(spanishPack("a"));
    expect(isPackActive("a")).toBe(true);
    removeImportedPack("a");
    expect(activePackIds()).toEqual([]);
    expect(isPackActive("a")).toBe(false);
  });

  it("ignores toggling an unknown pack id", () => {
    setPackActive("does-not-exist", true);
    expect(isPackActive("does-not-exist")).toBe(false);
  });
});

describe("base-pack selection", () => {
  it("keeps base on and un-disableable with nothing else loaded", () => {
    expect(isBaseActive()).toBe(true);
    expect(canDisableBase()).toBe(false);
    // A refusal to switch off with no other content is a no-op, not a crash.
    setBaseActive(false);
    expect(isBaseActive()).toBe(true);
    expect(currentContent().languages.some((l) => l.code === "fr")).toBe(true);
  });

  it("can be switched off once another pack is active", () => {
    load(spanishPack("es"));
    expect(canDisableBase()).toBe(true);
    setBaseActive(false);
    expect(isBaseActive()).toBe(false);
    // Only the imported pack's content remains; base's French is gone.
    expect(currentContent().vocab.some((v) => v.terms.es === "rojo")).toBe(true);
    expect(currentContent().languages.some((l) => l.code === "fr")).toBe(false);
  });

  it("comes back on automatically when the last other pack is switched off", () => {
    load(spanishPack("es"));
    setBaseActive(false);
    expect(isBaseActive()).toBe(false);
    setPackActive("es", false); // no other content left — base must return
    expect(isBaseActive()).toBe(true);
    expect(canDisableBase()).toBe(false);
    expect(currentContent().languages.some((l) => l.code === "fr")).toBe(true);
  });

  it("comes back on automatically when the last other pack is removed", () => {
    load(spanishPack("es"));
    setBaseActive(false);
    removeImportedPack("es");
    expect(isBaseActive()).toBe(true);
    expect(currentContent().languages.some((l) => l.code === "fr")).toBe(true);
  });
});

// A pack is allowed to leave out whole sections — a vocabulary-only pack is the
// common LLM output. Every consumer (the library's "x words · y sentences · z
// verbs" line, packsUsedBy, the review page) reads those sections directly, so
// the validator has to hand back a pack that HAS them.
describe("optional sections", () => {
  /** Valid per the schema: only the required fields, no sentences/verbs/pronouns. */
  const vocabOnly = (id = "vocab-only"): Record<string, unknown> => ({
    formatVersion: 1,
    id,
    name: "Vocabulary only",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    ],
    categories: [{ id: "colours", label: "Colours", emoji: "🎨" }],
    vocab: [{ category: "colours", level: "basic", terms: { en: "red", es: "rojo" } }],
  });

  it("accepts a pack with no sentences, verbs, pronouns or prepositions", () => {
    expect(validatePack(vocabOnly()).ok).toBe(true);
  });

  it("fills the missing sections in, so counting them never throws", () => {
    const r = validatePack(vocabOnly());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.sentences).toEqual([]);
    expect(r.pack.verbs).toEqual([]);
    expect(r.pack.prepositions).toEqual([]);
    expect(r.pack.pronouns).toEqual({});
    expect(r.pack.vocab).toHaveLength(1);
  });

  it("leaves a complete pack untouched (same object)", () => {
    const pack: ContentPack = { ...spanishPack(), prepositions: [] };
    const r = validatePack(pack);
    expect(r.ok && r.pack).toBe(pack);
  });

  it("stores the filled-in pack, so the library reads it back complete", () => {
    expect(importPackJson(JSON.stringify(vocabOnly("vo-import"))).ok).toBe(true);
    const stored = importedPacks().find((p) => p.id === "vo-import");
    expect(stored?.verbs).toEqual([]);
    expect(stored?.sentences).toEqual([]);
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

  it("claims the $id the build actually publishes it at", () => {
    // vite.config.ts emits the schema at CONTENT_SCHEMA_PATH. If $id names a
    // different URL, packs point somewhere that serves the SPA shell instead.
    expect(CONTENT_SCHEMA.$id.endsWith("/" + CONTENT_SCHEMA_PATH)).toBe(true);
    expect(BASE_PACK.$schema).toBe(CONTENT_SCHEMA.$id);
  });
});
