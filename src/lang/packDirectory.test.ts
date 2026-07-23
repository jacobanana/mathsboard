// Choosing packs + direction for a new board: packs group by their languages,
// only same-language packs combine, the direction defaults sensibly, and
// applying a choice drives the registry's active packs and the language pair.

import { afterEach, describe, expect, it } from "vitest";
import {
  importPackJson,
  importedPacks,
  isBaseActive,
  isPackActive,
  removeImportedPack,
  setBaseActive,
} from "@/lang/content/registry";
import {
  applyChoice,
  directionFor,
  groupPacks,
  initialChoice,
  packGroups,
  selectablePacks,
  signatureOf,
} from "@/lang/packDirectory";
import type { ContentPack } from "@/lang/content/schema";
import { useLangStore } from "@/lang/store";

/** A valid English↔French pack — same languages as base, so it combines. */
function frenchPack(id = "fr-extra"): ContentPack {
  return {
    formatVersion: 1,
    id,
    name: "French extra",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
    ],
    categories: [{ id: "colours", label: "Colours", emoji: "🎨" }],
    pronouns: {},
    vocab: [{ category: "colours", level: "basic", terms: { en: "red", fr: "rouge" } }],
    sentences: [],
    verbs: [],
  };
}

/** A valid English↔Spanish pack — a different language set from base. */
function spanishPack(id = "es-extra"): ContentPack {
  return {
    ...frenchPack(id),
    id,
    name: "Spanish extra",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    ],
    vocab: [{ category: "colours", level: "basic", terms: { en: "red", es: "rojo" } }],
  };
}

afterEach(() => {
  for (const p of [...importedPacks()]) removeImportedPack(p.id);
  setBaseActive(true);
  useLangStore.getState().setPair({ known: "en", learning: "fr" });
});

describe("signatureOf", () => {
  it("is the sorted language codes, order-independent", () => {
    expect(signatureOf([{ code: "fr" }, { code: "en" }])).toBe("en,fr");
    expect(signatureOf([{ code: "en" }, { code: "fr" }])).toBe("en,fr");
  });
});

describe("grouping", () => {
  it("always offers the built-in base pack", () => {
    const packs = selectablePacks();
    const base = packs.find((p) => p.isBase);
    expect(base?.id).toBe("base");
    expect(base?.signature).toBe("en,fr");
  });

  it("combines packs with the same languages into one group", () => {
    importPackJson(JSON.stringify(frenchPack()));
    const enfr = packGroups().find((g) => g.signature === "en,fr");
    expect(enfr?.packs.map((p) => p.id).sort()).toEqual(["base", "fr-extra"]);
  });

  it("keeps a different-language pack in its own group", () => {
    importPackJson(JSON.stringify(spanishPack()));
    const groups = packGroups();
    expect(groups.map((g) => g.signature).sort()).toEqual(["en,es", "en,fr"]);
    const es = groups.find((g) => g.signature === "en,es");
    expect(es?.packs.map((p) => p.id)).toEqual(["es-extra"]);
    // Base is NOT dragged into the Spanish group.
    expect(es?.packs.some((p) => p.isBase)).toBe(false);
  });
});

describe("directionFor", () => {
  it("keeps the learner's current pair when the group offers it", () => {
    const [group] = groupPacks(selectablePacks());
    expect(directionFor(group, { known: "fr", learning: "en" })).toEqual({
      known: "fr",
      learning: "en",
    });
  });

  it("falls back to the group's languages when the pair doesn't fit", () => {
    importPackJson(JSON.stringify(spanishPack()));
    const es = packGroups().find((g) => g.signature === "en,es")!;
    const dir = directionFor(es, { known: "fr", learning: "de" });
    expect(dir.known).toBe("en");
    expect(dir.learning).toBe("es");
  });
});

describe("initialChoice", () => {
  it("opens on the group holding the active packs, pre-ticked", () => {
    const { group, selected } = initialChoice(packGroups());
    expect(group?.signature).toBe("en,fr");
    expect([...selected]).toEqual(["base"]);
  });

  it("prefers the group with more active packs", () => {
    importPackJson(JSON.stringify(spanishPack())); // importing selects only it
    const { group, selected } = initialChoice(packGroups());
    expect(group?.signature).toBe("en,es");
    expect([...selected]).toEqual(["es-extra"]);
  });
});

describe("applyChoice", () => {
  it("switches active packs to exactly the selection and sets the pair", () => {
    importPackJson(JSON.stringify(frenchPack()));
    applyChoice(new Set(["base", "fr-extra"]), { known: "fr", learning: "en" });
    expect(isBaseActive()).toBe(true);
    expect(isPackActive("fr-extra")).toBe(true);
    expect(useLangStore.getState().pair).toEqual({ known: "fr", learning: "en" });
  });

  it("can drop the base pack when another pack carries the board", () => {
    importPackJson(JSON.stringify(frenchPack()));
    applyChoice(new Set(["fr-extra"]), { known: "en", learning: "fr" });
    expect(isBaseActive()).toBe(false);
    expect(isPackActive("fr-extra")).toBe(true);
  });

  it("ignores an invalid pair rather than corrupting the store", () => {
    applyChoice(new Set(["base"]), { known: "en", learning: "en" });
    expect(useLangStore.getState().pair).toEqual({ known: "en", learning: "fr" });
  });
});
