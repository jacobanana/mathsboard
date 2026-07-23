// packsUsedBy — which packs a board must carry so its custom content travels —
// and the ephemeral board-pack layer that re-registers them on load/join.

import { afterEach, describe, expect, it } from "vitest";
import { packsUsedBy, dedupePacks } from "@/lang/content/embed";
import type { ContentPack } from "@/lang/content/schema";
import {
  adoptBoardContent,
  boardPacksNow,
  currentContent,
  importedPacks,
  importPackJson,
  isBaseActive,
  isPackActive,
  removeImportedPack,
  setBaseActive,
  setBoardPacks,
  setPackActive,
} from "@/lang/content/registry";
import { languageByCode } from "@/lang/data";

function spanishPack(id = "es-pack"): ContentPack {
  return {
    formatVersion: 1,
    id,
    name: "Spanish",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    ],
    categories: [
      { id: "colours", label: "Colours", emoji: "🎨" }, // a BASE category
      { id: "space", label: "Space", emoji: "🚀" }, // a NEW category
    ],
    pronouns: {},
    vocab: [
      { category: "colours", level: "basic", terms: { en: "red", es: "rojo" } },
      { category: "space", level: "basic", terms: { en: "star", es: "estrella" } },
    ],
    sentences: [],
    verbs: [],
  };
}

const obj = (fields: Record<string, unknown>): Record<string, unknown> => ({
  type: "langflashcards",
  ...fields,
});

afterEach(() => {
  setBoardPacks([]);
  for (const p of [...importedPacks()]) removeImportedPack(p.id);
  setBaseActive(true);
});

describe("packsUsedBy", () => {
  const pack = spanishPack();

  it("returns nothing for a board using only built-in content", () => {
    const objs = [obj({ known: "en", learning: "fr", categories: ["colours"] })];
    expect(packsUsedBy(objs, [pack])).toEqual([]);
  });

  it("embeds a pack when a widget uses a non-built-in language", () => {
    const objs = [obj({ known: "en", learning: "es", categories: ["colours"] })];
    expect(packsUsedBy(objs, [pack]).map((p) => p.id)).toEqual(["es-pack"]);
  });

  it("embeds a pack when a widget uses a non-built-in theme", () => {
    const objs = [obj({ known: "en", learning: "fr", categories: ["space"] })];
    expect(packsUsedBy(objs, [pack]).map((p) => p.id)).toEqual(["es-pack"]);
  });

  it("ignores English (a built-in language every pack declares)", () => {
    // A plain en↔fr board must NOT drag in a pack just because the pack lists en.
    const objs = [obj({ known: "fr", learning: "en", categories: ["colours"] })];
    expect(packsUsedBy(objs, [pack])).toEqual([]);
  });

  it("ignores non-language objects", () => {
    const objs = [{ type: "fraction", learning: "es" }];
    expect(packsUsedBy(objs, [pack])).toEqual([]);
  });

  it("embeds a pack whose verb a conjugation widget uses", () => {
    const withVerb: ContentPack = {
      ...spanishPack("verb-pack"),
      verbs: [
        {
          id: "estar",
          level: "basic",
          infinitive: { en: "to be", es: "estar" },
          forms: {
            es: {
              present: ["estoy", "estás", "está", "estamos", "estáis", "están"],
              past: ["estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron"],
              imperfect: ["estaba", "estabas", "estaba", "estábamos", "estabais", "estaban"],
              futureSimple: ["estaré", "estarás", "estará", "estaremos", "estaréis", "estarán"],
            },
          },
        },
      ],
    };
    const objs = [obj({ type: "langconjugate", known: "en", learning: "es", verb: "estar" })];
    expect(packsUsedBy(objs, [withVerb]).map((p) => p.id)).toEqual(["verb-pack"]);
    // A built-in verb never triggers an embed.
    const baseVerb = [obj({ type: "langconjugate", verb: "etre" })];
    expect(packsUsedBy(baseVerb, [withVerb])).toEqual([]);
  });
});

describe("dedupePacks", () => {
  it("keeps the first occurrence of each id", () => {
    const a = spanishPack("x");
    const b = { ...spanishPack("x"), name: "second" };
    expect(dedupePacks([a, b])).toEqual([a]);
  });
});

describe("setBoardPacks", () => {
  it("registers a board's packs into the live catalogue, then clears them", () => {
    expect(languageByCode("es")).toBeUndefined();
    setBoardPacks([spanishPack()]);
    expect(languageByCode("es")?.name).toBe("Spanish");
    expect(currentContent().vocab.some((v) => v.terms.es === "estrella")).toBe(true);
    setBoardPacks([]);
    expect(languageByCode("es")).toBeUndefined();
  });

  it("does not double-count a board pack the user has also imported", () => {
    importPackJson(JSON.stringify(spanishPack("dup")));
    setBoardPacks([spanishPack("dup")]);
    const reds = currentContent().vocab.filter((v) => v.terms.es === "rojo");
    expect(reds).toHaveLength(1);
  });
});

describe("adoptBoardContent", () => {
  it("switches base off for a foreign-language board pack, and back on for a base-only board", () => {
    adoptBoardContent([spanishPack()]);
    expect(isBaseActive()).toBe(false);
    expect(boardPacksNow().map((p) => p.id)).toEqual(["es-pack"]);
    expect(languageByCode("es")?.name).toBe("Spanish");
    // Arriving at a board that provably teaches base-only content restores base.
    adoptBoardContent([], true);
    expect(isBaseActive()).toBe(true);
    expect(languageByCode("es")).toBeUndefined();
  });

  it("keeps the current selection when the board carries no packs and restoreBase is off", () => {
    importPackJson(JSON.stringify(spanishPack("mine")));
    expect(isBaseActive()).toBe(false); // foreign import switched base off
    adoptBoardContent([]);
    expect(isBaseActive()).toBe(false);
    expect(isPackActive("mine")).toBe(true);
  });

  it("activates the user's own INACTIVE imported copy of a board's pack", () => {
    importPackJson(JSON.stringify(spanishPack("mine")));
    setPackActive("mine", false);
    setBaseActive(true);
    expect(currentContent().vocab.some((v) => v.terms.es === "estrella")).toBe(false);
    // The board arrives carrying the same pack: the user's copy must teach —
    // setBoardPacks alone would drop the board copy AND leave the import off.
    adoptBoardContent([spanishPack("mine")]);
    expect(isPackActive("mine")).toBe(true);
    expect(boardPacksNow()).toEqual([]); // the library copy supersedes it
    expect(currentContent().vocab.some((v) => v.terms.es === "estrella")).toBe(true);
    expect(isBaseActive()).toBe(false);
  });

  it("restoring base drops foreign active imports so languages never mix", () => {
    importPackJson(JSON.stringify(spanishPack("mine")));
    expect(isPackActive("mine")).toBe(true);
    adoptBoardContent([], true);
    expect(isBaseActive()).toBe(true);
    expect(isPackActive("mine")).toBe(false);
  });
});
