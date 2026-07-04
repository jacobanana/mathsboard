// Doc-level schema upgrade applied to a live shared Y.Doc on join. Exercised
// against a real Y.Doc (no provider): seed legacy content, migrate, assert the
// authoritative doc — not just a read-side view — was rewritten, and that a
// current doc is left byte-for-byte untouched (no wasted transaction/sync).

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  DocMirror,
  migrateHandles,
  openHandles,
  seedDoc,
} from "@/collab/docModel";
import { newBoardDocument } from "@/board/types";
import { anObject, aStroke } from "@/testing/fixtures";

const seeded = (objects = [anObject()], strokes: ReturnType<typeof aStroke>[] = []) => {
  const doc = new Y.Doc();
  const h = openHandles(doc);
  seedDoc(h, { ...newBoardDocument(), objects, strokes });
  return { doc, h };
};

describe("migrateHandles", () => {
  it("rewrites a legacy wall fraction to fractionwall in the authoritative doc", () => {
    const wall = anObject({
      type: "fraction",
      mode: "wall",
      max: 10,
      w: 480,
      h: 340,
    });
    const { h } = seeded([wall]);

    migrateHandles(h);

    const y = h.objects.get(wall.id)!;
    expect(y.get("type")).toBe("fractionwall");
    expect(y.get("max")).toBe(10);
    expect(y.get("w")).toBe(480); // geometry preserved
    expect(y.has("mode")).toBe(false); // wall-only field dropped

    // The mirror (what the store/canvas render from) now sees a fractionwall.
    const board = new DocMirror(h).read("fallback");
    expect(board.objects[0].type).toBe("fractionwall");
    expect(board.objects[0].id).toBe(wall.id);
  });

  it("makes no transaction on an already-current doc", () => {
    const { doc, h } = seeded([anObject({ type: "fraction", mode: "bars" })]);
    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });

    migrateHandles(h);
    expect(updates).toBe(0); // nothing to upgrade -> nothing written -> nothing to sync
  });

  it("is idempotent — a second pass is a no-op", () => {
    const { doc, h } = seeded([
      anObject({ type: "fraction", mode: "wall", max: 6 }),
    ]);
    migrateHandles(h);

    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });
    migrateHandles(h);
    expect(updates).toBe(0);
  });

  it("reconciles whole-shape adds and removes, not just field edits", () => {
    // Exercises the generic diff via a migration that changes the SHAPE SET:
    // baking a legacy overlay eraser splits one pen stroke into two fragments
    // (a new id appears) and drops the eraser stroke (an id disappears).
    const pen = aStroke({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    const eraser = aStroke({
      mode: "eraser",
      points: [{ x: 50, y: -20 }, { x: 50, y: 20 }],
      size: 20,
    });
    const { h } = seeded([], [pen, eraser]);

    migrateHandles(h);

    // eraser removed, pen split into two pen fragments (original id kept).
    expect(h.strokes.has(eraser.id)).toBe(false);
    const ids = [...h.strokes.keys()];
    expect(ids).toHaveLength(2);
    expect(ids).toContain(pen.id);
    ids.forEach((id) => expect(h.strokes.get(id)!.get("mode")).toBe("pen"));
  });
});
