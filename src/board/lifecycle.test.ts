// The solo load/save lifecycle: the working draft, the named library, and the
// dirty flag. This is the data-loss surface — a teacher's board must survive
// reloads, explicit saves, opens and deletes exactly as described on the
// store's action contracts. Storage is asserted through localRepository (the
// same seam the store uses), never by poking raw localStorage keys.
//
// Fake timers control the 400ms draft-autosave debounce (and freeze Date.now,
// which the tests advance to order updatedAt timestamps).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardStore } from "@/board/store";
import { localRepository } from "@/board/persistence/LocalBoardRepository";
import { newBoardDocument, UNTITLED_NAME } from "@/board/types";
import type { BoardDocument } from "@/board/types";
import { aStroke, freshBoard } from "@/testing/fixtures";

const st = () => useBoardStore.getState();

const aDoc = (over: Partial<BoardDocument> = {}): BoardDocument => ({
  ...newBoardDocument(),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  freshBoard(); // clean session + empty localStorage
});

afterEach(() => {
  vi.useRealTimers();
});

describe("init", () => {
  it("first run: seeds a blank untitled draft and persists it", async () => {
    localStorage.clear();
    await st().init();

    expect(st().board.name).toBe(UNTITLED_NAME);
    expect(st().board.objects).toHaveLength(0);
    expect(st().sourceId).toBeNull();
    expect(st().dirty).toBe(false);

    const draft = await localRepository.loadDraft();
    expect(draft?.doc.id).toBe(st().board.id);
  });

  it("resumes an existing draft exactly (content, source link, dirtiness)", async () => {
    localStorage.clear();
    await localRepository.saveDraft({
      doc: aDoc({ name: "Mid-lesson board", strokes: [aStroke()] }),
      sourceId: "lib-1",
      dirty: true,
    });

    await st().init();

    expect(st().board.name).toBe("Mid-lesson board");
    expect(st().board.strokes).toHaveLength(1);
    expect(st().sourceId).toBe("lib-1");
    expect(st().dirty).toBe(true);
  });

  it("with no draft, seeds from the NEWEST library board without touching the library", async () => {
    localStorage.clear();
    await localRepository.save(aDoc({ name: "Older", updatedAt: 1000 }));
    const newer = aDoc({ name: "Newer", updatedAt: 2000 });
    await localRepository.save(newer);

    await st().init();

    expect(st().board.name).toBe("Newer");
    expect(st().sourceId).toBe(newer.id);
    expect(st().dirty).toBe(false);
    expect(await localRepository.list()).toHaveLength(2); // library untouched
  });

  it("bakes legacy overlay-eraser strokes while loading a draft", async () => {
    localStorage.clear();
    const pen = aStroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    const eraser = aStroke({
      mode: "eraser",
      points: [{ x: 50, y: -20 }, { x: 50, y: 20 }],
      size: 20,
    });
    await localRepository.saveDraft({
      doc: aDoc({ strokes: [pen, eraser] }),
      sourceId: null,
      dirty: false,
    });

    await st().init();

    const strokes = st().board.strokes;
    expect(strokes.every((s) => s.mode === "pen")).toBe(true);
    expect(strokes).toHaveLength(2); // the pen split around the erased gap
  });
});

describe("save", () => {
  it("saveCurrent on a never-saved draft asks for a name and writes nothing", async () => {
    await st().init();
    st().addStroke(aStroke());

    expect(await st().saveCurrent()).toEqual({ needsName: true });
    expect(await localRepository.list()).toHaveLength(0);
    expect(st().dirty).toBe(true);
  });

  it("saveAs creates a library board, links and renames the draft", async () => {
    await st().init();
    st().addStroke(aStroke());

    await st().saveAs("Fractions Y4");

    const list = await localRepository.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Fractions Y4");
    expect(st().sourceId).toBe(list[0].id);
    expect(st().dirty).toBe(false);
    expect(st().board.name).toBe("Fractions Y4");

    const draft = await localRepository.loadDraft();
    expect(draft?.sourceId).toBe(list[0].id);
    expect(draft?.dirty).toBe(false);
  });

  it("edits re-dirty a saved board, autosave persists them, saveCurrent cleans", async () => {
    await st().init();
    await st().saveAs("My board");

    st().addStroke(aStroke());
    expect(st().dirty).toBe(true);

    // The debounced autosave writes the DRAFT (not the library board).
    vi.advanceTimersByTime(400);
    const draft = await localRepository.loadDraft();
    expect(draft?.doc.strokes).toHaveLength(1);
    expect(draft?.dirty).toBe(true);
    const beforeSave = await localRepository.load(st().sourceId!);
    expect(beforeSave?.strokes).toHaveLength(0);

    // Explicit save writes the library board and cleans the flag.
    expect(await st().saveCurrent()).toEqual({ needsName: false });
    expect(st().dirty).toBe(false);
    const saved = await localRepository.load(st().sourceId!);
    expect(saved?.strokes).toHaveLength(1);
  });
});

describe("open / new / delete / rename", () => {
  it("openBoard loads a copy, links it, and resets camera/selection/history", async () => {
    await st().init();
    st().addStroke(aStroke());
    await st().saveAs("Source board");
    const sourceId = st().sourceId!;

    await st().newBoard();
    st().setCamera({ x: 50, y: 60, scale: 2 });
    st().addStroke(aStroke());
    expect(st().canUndo).toBe(true);

    await st().openBoard(sourceId);

    expect(st().board.name).toBe("Source board");
    expect(st().board.strokes).toHaveLength(1);
    expect(st().sourceId).toBe(sourceId);
    expect(st().dirty).toBe(false);
    expect(st().camera).toEqual({ x: 0, y: 0, scale: 1 });
    expect(st().canUndo).toBe(false);
    expect(st().selection).toEqual({ objectIds: [], strokeIds: [] });
  });

  it("newBoard starts a fresh unlinked draft", async () => {
    await st().init();
    st().addStroke(aStroke());
    await st().saveAs("Kept board");

    await st().newBoard();

    expect(st().board.strokes).toHaveLength(0);
    expect(st().board.name).toBe(UNTITLED_NAME);
    expect(st().sourceId).toBeNull();
    expect(st().dirty).toBe(false);
    expect((await localRepository.loadDraft())?.sourceId).toBeNull();
    expect(await localRepository.list()).toHaveLength(1); // library keeps it
  });

  it("deleting the open board's source keeps the work but unlinks it as a dirty draft", async () => {
    await st().init();
    st().addStroke(aStroke());
    await st().saveAs("Doomed");
    const sourceId = st().sourceId!;

    await st().deleteBoard(sourceId);

    expect(await localRepository.list()).toHaveLength(0);
    expect(st().board.strokes).toHaveLength(1); // still on screen
    expect(st().sourceId).toBeNull();
    expect(st().dirty).toBe(true);
    expect((await localRepository.loadDraft())?.dirty).toBe(true);
  });

  it("renameBoard renames the library entry and the open draft's title", async () => {
    await st().init();
    await st().saveAs("Old name");
    const sourceId = st().sourceId!;

    await st().renameBoard(sourceId, "New name");

    expect((await localRepository.list())[0].name).toBe("New name");
    expect(st().board.name).toBe("New name");
    expect((await localRepository.loadDraft())?.doc.name).toBe("New name");
  });

  it("listBoards returns the library newest first", async () => {
    await st().init();
    await localRepository.save(aDoc({ name: "Older", updatedAt: 1000 }));
    await localRepository.save(aDoc({ name: "Newer", updatedAt: 2000 }));

    const names = (await st().listBoards()).map((b) => b.name);
    expect(names).toEqual(["Newer", "Older"]);
  });
});
