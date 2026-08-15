/**
 * @vitest-environment-options { "url": "http://localhost/language/" }
 */
// WHAT A BOARD TEACHES, end to end. The jsdom URL above puts this file on the
// LANGUAGE flavour (src/subject.ts resolves the subject from the URL at module
// load), which is what switches the store's content wiring on — so these tests
// exercise the real path a saved board takes: save it, go elsewhere, open it
// again, and check the app is teaching what the board says it teaches.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardStore, resetAdoptedContent } from "@/board/store";
import { localRepository } from "@/board/persistence/LocalBoardRepository";
import { newBoardDocument, type AnyBoardObject, type BoardDocument } from "@/board/types";
import { freshBoard } from "@/testing/fixtures";
import type { ContentPack } from "@/lang/content/schema";
import {
  BASE_PACK,
  boardPacksNow,
  importPackJson,
  importedPacks,
  isBaseActive,
  isPackActive,
  removeImportedPack,
  setBaseActive,
  setBoardPacks,
  setPackActive,
} from "@/lang/content/registry";
import {
  applySetup,
  currentSetup,
  inferSetup,
  packsToEmbed,
  resolveSetup,
  sameSetup,
  setupOf,
  setupSignature,
  withPacks,
} from "@/lang/content/boardContent";
import { useLangStore } from "@/lang/store";
import { languageByCode } from "@/lang/data";

const st = () => useBoardStore.getState();

/** An English↔Spanish pack: a different language set from the built-in one. */
function spanishPack(id = "es-pack"): ContentPack {
  return {
    formatVersion: 1,
    id,
    name: "Spanish starter",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
    ],
    categories: [{ id: "space", label: "Space", emoji: "🚀" }],
    pronouns: {},
    vocab: [{ category: "space", level: "basic", terms: { en: "star", es: "estrella" } }],
    sentences: [],
    verbs: [],
  };
}

/** A second English↔Spanish pack, so several can be combined on one board. */
function spanishExtra(id = "es-extra"): ContentPack {
  return {
    ...spanishPack(id),
    name: "Spanish food",
    categories: [{ id: "food-es", label: "Food", emoji: "🍎" }],
    vocab: [{ category: "food-es", level: "basic", terms: { en: "bread", es: "pan" } }],
  };
}

/** An English↔French pack — the SAME languages as the built-in pack, so it
 *  combines with it rather than replacing it. */
function frenchExtra(id = "fr-extra"): ContentPack {
  return {
    ...spanishPack(id),
    name: "French extra",
    languages: [
      { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
      { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
    ],
    categories: [{ id: "space-fr", label: "Space", emoji: "🚀" }],
    vocab: [{ category: "space-fr", level: "basic", terms: { en: "star", fr: "étoile" } }],
  };
}

const aVocabWidget = (over: Record<string, unknown> = {}): AnyBoardObject => ({
  id: "w1",
  type: "langvocab",
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  known: "en",
  learning: "es",
  categories: ["space"],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  freshBoard();
  resetAdoptedContent();
});

afterEach(() => {
  vi.useRealTimers();
  setBoardPacks([]);
  for (const p of [...importedPacks()]) removeImportedPack(p.id);
  setBaseActive(true);
  useLangStore.getState().setPair({ known: "en", learning: "fr" });
  resetAdoptedContent();
});

describe("the language flavour is active", () => {
  it("resolves the subject from the test URL", async () => {
    const { IS_LANGUAGE } = await import("@/subject");
    expect(IS_LANGUAGE).toBe(true);
  });
});

describe("setupOf / inferSetup", () => {
  it("prefers what the board declares", () => {
    const board: BoardDocument = {
      ...newBoardDocument(),
      contentSetup: { known: "en", learning: "es", packIds: ["es-pack"] },
      objects: [aVocabWidget({ known: "fr", learning: "en" })],
    };
    expect(setupOf(board)).toEqual({ known: "en", learning: "es", packIds: ["es-pack"] });
  });

  it("infers a legacy board's choice from its widgets and carried packs", () => {
    const board: BoardDocument = {
      ...newBoardDocument(),
      objects: [aVocabWidget()],
      contentPacks: [spanishPack()],
    };
    expect(inferSetup(board)).toEqual({
      known: "en",
      learning: "es",
      packIds: ["es-pack"],
    });
  });

  it("reads a pack-less legacy board as built-in content", () => {
    const board: BoardDocument = { ...newBoardDocument(), objects: [aVocabWidget()] };
    expect(inferSetup(board)?.packIds).toEqual(["base"]);
  });

  it("says nothing about a board with no language content at all", () => {
    expect(inferSetup(newBoardDocument())).toBeUndefined();
  });

  it("ignores a malformed declaration and falls back", () => {
    const board = {
      ...newBoardDocument(),
      contentSetup: { known: "en", learning: "en", packIds: [] },
      objects: [aVocabWidget()],
    } as unknown as BoardDocument;
    expect(setupOf(board)?.packIds).toEqual(["base"]);
  });
});

describe("sameSetup / setupSignature", () => {
  const a = { known: "en", learning: "es", packIds: ["base", "x"] };
  it("ignores the order of the pack ids", () => {
    expect(sameSetup(a, { known: "en", learning: "es", packIds: ["x", "base"] })).toBe(true);
    expect(setupSignature(a)).toBe(setupSignature({ ...a, packIds: ["x", "base"] }));
  });
  it("separates a different direction or a different pack set", () => {
    expect(sameSetup(a, { ...a, known: "es", learning: "en" })).toBe(false);
    expect(sameSetup(a, { ...a, packIds: ["base"] })).toBe(false);
  });
});

describe("resolveSetup", () => {
  it("finds packs in the library and in the board's own content", () => {
    importPackJson(JSON.stringify(spanishPack()));
    setBoardPacks([spanishExtra()]);
    const r = resolveSetup({
      known: "en",
      learning: "es",
      packIds: ["base", "es-pack", "es-extra", "gone"],
    });
    expect(r.base).toBe(true);
    expect(r.packs.map((p) => p.id)).toEqual(["es-pack", "es-extra"]);
    expect(r.missingIds).toEqual(["gone"]);
  });
});

describe("applySetup", () => {
  it("switches the catalogue and the direction to exactly what a setup names", () => {
    importPackJson(JSON.stringify(spanishPack()));
    expect(isPackActive("es-pack")).toBe(false); // loading alone doesn't teach

    applySetup({ known: "en", learning: "es", packIds: ["es-pack"] });

    expect(isPackActive("es-pack")).toBe(true);
    expect(isBaseActive()).toBe(false); // a different language set — never mixed
    expect(languageByCode("es")?.name).toBe("Spanish");
    expect(useLangStore.getState().pair).toEqual({ known: "en", learning: "es" });
  });

  it("combines several packs that teach the same languages", () => {
    importPackJson(JSON.stringify(spanishPack()));
    importPackJson(JSON.stringify(spanishExtra()));

    applySetup({ known: "en", learning: "es", packIds: ["es-pack", "es-extra"] });

    expect(isPackActive("es-pack")).toBe(true);
    expect(isPackActive("es-extra")).toBe(true);
  });

  it("keeps the built-in pack alongside a same-language one", () => {
    importPackJson(JSON.stringify(frenchExtra()));
    applySetup({ known: "en", learning: "fr", packIds: ["base", "fr-extra"] });
    expect(isBaseActive()).toBe(true);
    expect(isPackActive("fr-extra")).toBe(true);
  });

  it("goes back to the built-in pack for a board that names only it", () => {
    importPackJson(JSON.stringify(spanishPack()));
    applySetup({ known: "en", learning: "es", packIds: ["es-pack"] });
    applySetup({ known: "en", learning: "fr", packIds: ["base"] });
    expect(isBaseActive()).toBe(true);
    expect(isPackActive("es-pack")).toBe(false);
    expect(languageByCode("es")).toBeUndefined();
  });

  it("falls back to the built-in pack when the named content isn't on this device", () => {
    applySetup({ known: "en", learning: "es", packIds: ["never-loaded"] });
    expect(isBaseActive()).toBe(true); // never an empty catalogue
  });

  it("is idempotent", () => {
    importPackJson(JSON.stringify(spanishPack()));
    const setup = { known: "en", learning: "es", packIds: ["es-pack"] };
    applySetup(setup);
    applySetup(setup);
    expect(isPackActive("es-pack")).toBe(true);
    expect(isBaseActive()).toBe(false);
  });
});

describe("currentSetup", () => {
  it("reports the live choice, including the open board's own packs", () => {
    importPackJson(JSON.stringify(spanishPack()));
    setPackActive("es-pack", true);
    setBoardPacks([spanishExtra()]);
    useLangStore.getState().setPair({ known: "en", learning: "es" });
    expect(currentSetup()).toEqual({
      known: "en",
      learning: "es",
      packIds: ["es-pack", "es-extra"],
    });
  });
});

describe("withPacks", () => {
  const setup = { known: "en", learning: "es", packIds: ["es-pack"] };

  it("adds a freshly loaded pack that teaches the same languages", () => {
    expect(withPacks(setup, [spanishExtra()])?.packIds).toEqual(["es-pack", "es-extra"]);
  });

  it("leaves the board alone for a pack of other languages", () => {
    expect(withPacks(setup, [frenchExtra()])).toBeNull();
  });

  it("does not re-add a pack the board already teaches from", () => {
    expect(withPacks(setup, [spanishPack()])).toBeNull();
  });
});

describe("packsToEmbed", () => {
  it("carries a chosen pack even before any widget uses it", () => {
    const board = newBoardDocument();
    const packs = packsToEmbed(
      board,
      { known: "en", learning: "es", packIds: ["base", "es-pack"] },
      [BASE_PACK, spanishPack()],
    );
    expect(packs.map((p) => p.id)).toEqual(["es-pack"]);
  });

  it("carries a pack a widget needs even when the choice forgot it", () => {
    const board: BoardDocument = { ...newBoardDocument(), objects: [aVocabWidget()] };
    const packs = packsToEmbed(board, { known: "en", learning: "es", packIds: ["base"] }, [
      BASE_PACK,
      spanishPack(),
    ]);
    expect(packs.map((p) => p.id)).toEqual(["es-pack"]);
  });

  it("never carries the built-in pack", () => {
    const board = newBoardDocument();
    const setup = { known: "en", learning: "fr", packIds: ["base"] };
    expect(packsToEmbed(board, setup, [BASE_PACK])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The reported bug: a board saved with custom content came back teaching
// whatever the device last had switched on, because the choice lived only on
// the device. These drive the real store actions end to end.
// ---------------------------------------------------------------------------
describe("saving and reopening a board with custom content", () => {
  const esSetup = { known: "en", learning: "es", packIds: ["es-pack"] };

  it("stamps the new board's content choice onto the document", async () => {
    importPackJson(JSON.stringify(spanishPack()));
    await st().newBoard(esSetup);
    expect(st().board.contentSetup).toEqual(esSetup);
    expect(isPackActive("es-pack")).toBe(true);
    expect(useLangStore.getState().pair).toEqual({ known: "en", learning: "es" });
  });

  it("reopens teaching its own content, not whatever the device last used", async () => {
    importPackJson(JSON.stringify(spanishPack()));
    await st().newBoard(esSetup);
    await st().saveAs("Spanish lesson");
    const spanishId = st().sourceId!;

    // Go somewhere else entirely — a plain built-in board.
    await st().newBoard({ known: "en", learning: "fr", packIds: ["base"] });
    expect(isBaseActive()).toBe(true);
    expect(isPackActive("es-pack")).toBe(false);

    await st().openBoard(spanishId);

    expect(st().board.contentSetup).toEqual(esSetup);
    expect(isPackActive("es-pack")).toBe(true);
    expect(isBaseActive()).toBe(false);
    expect(languageByCode("es")?.name).toBe("Spanish");
    expect(useLangStore.getState().pair).toEqual({ known: "en", learning: "es" });
  });

  it("keeps both packs of a two-pack board on reopen", async () => {
    importPackJson(JSON.stringify(spanishPack()));
    importPackJson(JSON.stringify(spanishExtra()));
    await st().newBoard({ known: "en", learning: "es", packIds: ["es-pack", "es-extra"] });
    await st().saveAs("Two packs");
    const id = st().sourceId!;

    await st().newBoard({ known: "en", learning: "fr", packIds: ["base"] });
    await st().openBoard(id);

    expect(isPackActive("es-pack")).toBe(true);
    expect(isPackActive("es-extra")).toBe(true);
  });

  it("carries its packs so another device can open it", async () => {
    importPackJson(JSON.stringify(spanishPack()));
    await st().newBoard(esSetup);
    // An edit is what triggers the embed (see syncBoardContent).
    st().addObject(aVocabWidget());
    await vi.advanceTimersByTimeAsync(0);
    await st().saveAs("Travelling board");
    const saved = await localRepository.load(st().sourceId!);
    expect(saved?.contentPacks?.map((p) => p.id)).toEqual(["es-pack"]);

    // "Another device": the pack is not in the library, only on the board.
    removeImportedPack("es-pack");
    resetAdoptedContent();
    await st().openBoard(saved!.id);

    expect(boardPacksNow().map((p) => p.id)).toEqual(["es-pack"]);
    expect(languageByCode("es")?.name).toBe("Spanish");
    expect(useLangStore.getState().pair).toEqual({ known: "en", learning: "es" });
  });

  it("upgrades a board saved before boards declared their content", async () => {
    // A legacy document: no contentSetup, but a widget and a carried pack that
    // between them say what it taught.
    const legacy: BoardDocument = {
      ...newBoardDocument(),
      name: "Legacy",
      objects: [aVocabWidget()],
      contentPacks: [spanishPack()],
    };
    await localRepository.save(legacy);
    await st().openBoard(legacy.id);

    expect(isBaseActive()).toBe(false);
    expect(languageByCode("es")?.name).toBe("Spanish");
    expect(useLangStore.getState().pair).toEqual({ known: "en", learning: "es" });

    // Its first edit records the choice, so it is self-describing from now on.
    st().addStroke({
      id: "s1",
      mode: "pen",
      color: "#000",
      size: 4,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(st().board.contentSetup).toEqual({
      known: "en",
      learning: "es",
      packIds: ["es-pack"],
    });
  });
});

describe("changing what the open board teaches", () => {
  it("applies the choice and records it on the document", async () => {
    importPackJson(JSON.stringify(spanishPack()));
    await st().newBoard({ known: "en", learning: "fr", packIds: ["base"] });

    st().setBoardContent({ known: "en", learning: "es", packIds: ["es-pack"] });

    expect(isPackActive("es-pack")).toBe(true);
    expect(st().board.contentSetup?.packIds).toEqual(["es-pack"]);
    expect(st().board.contentPacks?.map((p) => p.id)).toEqual(["es-pack"]);
    expect(st().dirty).toBe(true);
  });

  it("adds a second pack to a board without dropping the first", async () => {
    importPackJson(JSON.stringify(spanishPack()));
    importPackJson(JSON.stringify(spanishExtra()));
    await st().newBoard({ known: "en", learning: "es", packIds: ["es-pack"] });

    st().setBoardContent({ known: "en", learning: "es", packIds: ["es-pack", "es-extra"] });

    expect(isPackActive("es-pack")).toBe(true);
    expect(isPackActive("es-extra")).toBe(true);
    expect(st().board.contentSetup?.packIds).toEqual(["es-pack", "es-extra"]);
  });
});
