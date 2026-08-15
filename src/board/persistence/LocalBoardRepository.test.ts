// Subject scoping in the persistence layer: a maths board and a language board
// share localStorage but must never share a LIST. Each repository is built for
// one subject and returns only that flavour's boards, drafts and shared-board
// pointers. Documents saved before the subject field existed carry none and
// must read as maths — the migration-safety guarantee that old boards keep
// loading in the maths app and never leak into the language list.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalBoardRepository } from "@/board/persistence/LocalBoardRepository";
import { newBoardDocument } from "@/board/types";
import type { BoardDocument } from "@/board/types";

const maths = new LocalBoardRepository("maths");
const language = new LocalBoardRepository("language");

const aDoc = (over: Partial<BoardDocument> = {}): BoardDocument => ({
  ...newBoardDocument(),
  ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("list() is scoped to the repository's subject", () => {
  it("shows only same-subject boards to each flavour", async () => {
    await maths.save(aDoc({ name: "Fractions", subject: "maths" }));
    await language.save(aDoc({ name: "Verbs", subject: "language" }));

    expect((await maths.list()).map((b) => b.name)).toEqual(["Fractions"]);
    expect((await language.list()).map((b) => b.name)).toEqual(["Verbs"]);
  });

  it("treats a legacy board (no subject) as maths", async () => {
    // A board saved before the subject field existed: write it raw so save()
    // doesn't stamp a subject onto it.
    const legacy = aDoc({ name: "Old board" });
    delete legacy.subject;
    localStorage.setItem("mathsboard:" + legacy.id, JSON.stringify(legacy));

    expect((await maths.list()).map((b) => b.name)).toEqual(["Old board"]);
    expect(await language.list()).toHaveLength(0);
  });

  it("save() stamps the repository's subject onto a subject-less board", async () => {
    const legacy = aDoc({ name: "Adopted" });
    delete legacy.subject;

    await language.save(legacy);

    const reloaded = await language.load(legacy.id);
    expect(reloaded?.subject).toBe("language");
    expect(await maths.list()).toHaveLength(0);
  });

  it("does not mistake another flavour's draft for a board", async () => {
    // The language draft key shares the mathsboard: prefix; maths.list() must
    // skip it rather than parse the DraftEnvelope as a board.
    await language.saveDraft({
      doc: aDoc({ subject: "language" }),
      sourceId: null,
      dirty: false,
    });
    await maths.save(aDoc({ name: "Only board", subject: "maths" }));

    expect((await maths.list()).map((b) => b.name)).toEqual(["Only board"]);
  });
});

describe("the working draft is per-subject", () => {
  it("keeps maths and language drafts independent", async () => {
    await maths.saveDraft({
      doc: aDoc({ name: "Maths draft", subject: "maths" }),
      sourceId: null,
      dirty: false,
    });
    await language.saveDraft({
      doc: aDoc({ name: "Language draft", subject: "language" }),
      sourceId: null,
      dirty: true,
    });

    expect((await maths.loadDraft())?.doc.name).toBe("Maths draft");
    expect((await language.loadDraft())?.doc.name).toBe("Language draft");
  });

  it("maths uses the original key so a pre-split draft still loads", async () => {
    // A draft written under the old single key, before the per-subject split.
    localStorage.setItem(
      "mathsboard:draft",
      JSON.stringify({ doc: aDoc({ name: "Legacy draft" }), sourceId: null, dirty: false }),
    );

    expect((await maths.loadDraft())?.doc.name).toBe("Legacy draft");
    expect(await language.loadDraft()).toBeNull();
  });
});

describe("remembered remote (shared) boards are scoped to the subject", () => {
  it("lists only this flavour's shared boards", async () => {
    await maths.saveRemote({ id: "aaa", name: "Shared maths", updatedAt: 1 });
    await language.saveRemote({ id: "bbb", name: "Shared lang", updatedAt: 2 });

    expect((await maths.listRemotes()).map((r) => r.name)).toEqual(["Shared maths"]);
    expect((await language.listRemotes()).map((r) => r.name)).toEqual(["Shared lang"]);
  });

  it("treats a legacy remote pointer (no subject) as maths", async () => {
    // A remote map entry written before the subject field existed.
    localStorage.setItem(
      "mathsboard:remotes",
      JSON.stringify({ ccc: { name: "Old shared", updatedAt: 3 } }),
    );

    expect((await maths.listRemotes()).map((r) => r.name)).toEqual(["Old shared"]);
    expect(await language.listRemotes()).toHaveLength(0);
  });
});

describe("per-board views (where each board was left)", () => {
  it("round-trips a camera per board and returns null for an unseen one", async () => {
    await maths.saveView("board-a", { x: -120, y: 40, scale: 2 });
    await maths.saveView("board-b", { x: 8, y: 9, scale: 0.5 });

    expect(await maths.loadView("board-a")).toEqual({ x: -120, y: 40, scale: 2 });
    expect(await maths.loadView("board-b")).toEqual({ x: 8, y: 9, scale: 0.5 });
    expect(await maths.loadView("never-opened")).toBeNull();
  });

  it("is shared across subjects (board ids are unique) and survives a rewrite", async () => {
    await maths.saveView("board-a", { x: 1, y: 2, scale: 1 });
    expect(await language.loadView("board-a")).toEqual({ x: 1, y: 2, scale: 1 });

    await maths.saveView("board-a", { x: 3, y: 4, scale: 3 });
    expect(await maths.loadView("board-a")).toEqual({ x: 3, y: 4, scale: 3 });
  });

  it("removeView forgets one board and leaves the others alone", async () => {
    await maths.saveView("board-a", { x: 1, y: 2, scale: 1 });
    await maths.saveView("board-b", { x: 3, y: 4, scale: 1 });

    await maths.removeView("board-a");

    expect(await maths.loadView("board-a")).toBeNull();
    expect(await maths.loadView("board-b")).not.toBeNull();
  });

  it("ignores a corrupt or unusable stored view rather than restoring a broken camera", async () => {
    localStorage.setItem(
      "mathsboard:views",
      JSON.stringify({
        nan: { x: 0, y: 0, scale: null },
        zero: { x: 0, y: 0, scale: 0 },
        good: { x: 5, y: 5, scale: 1.5 },
      }),
    );

    expect(await maths.loadView("nan")).toBeNull();
    expect(await maths.loadView("zero")).toBeNull();
    expect(await maths.loadView("good")).toEqual({ x: 5, y: 5, scale: 1.5 });
  });

  it("the views map is not mistaken for a library board", async () => {
    await maths.save(aDoc({ name: "Fractions", subject: "maths" }));
    await maths.saveView("board-a", { x: 1, y: 2, scale: 1 });

    expect((await maths.list()).map((b) => b.name)).toEqual(["Fractions"]);
  });
});
