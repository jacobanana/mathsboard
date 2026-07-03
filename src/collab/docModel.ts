// The CRDT document model: how a BoardDocument maps onto a Y.Doc.
//
// ============================= MERGE BEHAVIOUR =============================
// The board is TWO top-level Y.Maps keyed by shape id (objects, strokes) plus
// a small `meta` Y.Map (name / background / timestamps).
//
//   - Each shape is its own *nested Y.Map*, NOT a plain JS value. Every field
//     (x, y, w, h, color, tool params, ...) is an individual CRDT entry, so two
//     people editing DIFFERENT properties of the SAME shape merge per-field:
//     one user moves it (sets x/y) while another recolors it (sets color) and
//     both edits survive. Concurrent writes to the SAME field resolve
//     last-writer-wins, which is what you want for scalars like x or color.
//   - Independent additions merge automatically (distinct map keys).
//   - Deletion = removing the key. A concurrent field-edit on a deleted shape
//     is simply dropped with it - the delete wins, which reads naturally.
//
//   One deliberate exception: a stroke's `points` array is stored as a plain
//   value (one field), not a Y.Array. Strokes are write-once at pen-up; the
//   only later rewrites (drag-translate, eraser splits) replace ALL points at
//   once, and merging two half-translated point lists element-wise would
//   produce garbage. Whole-field LWW is the correct semantics - and the other
//   stroke fields (color, size) still merge per-field alongside it.
//
//   Z-ORDER: Y.Maps are unordered, so each shape carries an `order` number
//   (creation timestamp; seeded documents use their array index). Rendering
//   sorts by it, ties broken by id, which is deterministic on every client.
// ===========================================================================

import * as Y from "yjs";
import type { AnyBoardObject, BoardDocument, Stroke } from "@/board/types";
import { UNTITLED_NAME } from "@/board/types";

/**
 * Transaction origin for edits made by THIS user through the store actions.
 * The Y.UndoManager tracks ONLY this origin, so undo/redo reverts your own
 * edits and never a collaborator's (their transactions arrive with the
 * provider as origin) nor programmatic seeding (SEED_ORIGIN).
 */
export const LOCAL_ORIGIN = "mathsboard:local";
/** Origin for programmatic document loading/seeding - never undoable. */
export const SEED_ORIGIN = "mathsboard:seed";
/**
 * Origin for LIVE WIDGET STATE edits (typed quiz answers, marks). These sync
 * and persist like any document edit, but the UndoManager doesn't track this
 * origin - Ctrl+Z never reverts something someone typed into a widget.
 */
export const INPUT_ORIGIN = "mathsboard:input";

export interface DocHandles {
  doc: Y.Doc;
  meta: Y.Map<unknown>;
  objects: Y.Map<Y.Map<unknown>>;
  strokes: Y.Map<Y.Map<unknown>>;
}

export function openHandles(doc: Y.Doc): DocHandles {
  return {
    doc,
    meta: doc.getMap("meta"),
    objects: doc.getMap("objects") as Y.Map<Y.Map<unknown>>,
    strokes: doc.getMap("strokes") as Y.Map<Y.Map<unknown>>,
  };
}

/** Plain shape record -> nested Y.Map (one CRDT entry per field). */
export function toYShape(rec: Record<string, unknown>): Y.Map<unknown> {
  return new Y.Map(Object.entries(rec));
}

function fromYShape<T>(ymap: Y.Map<unknown>): T {
  const out: Record<string, unknown> = {};
  ymap.forEach((v, k) => {
    out[k] = v;
  });
  return out as T;
}

/** Deterministic draw order: `order` ascending, ties broken by id. */
function byOrder(
  a: { id: string; order?: unknown },
  b: { id: string; order?: unknown },
): number {
  const ao = typeof a.order === "number" ? a.order : 0;
  const bo = typeof b.order === "number" ? b.order : 0;
  return ao - bo || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Seed an (empty) doc from a BoardDocument. Shapes keep an existing `order`
 * or get their array index, preserving the array's draw order. Runs under
 * SEED_ORIGIN so it is neither undoable nor mistaken for a user edit.
 */
export function seedDoc(h: DocHandles, board: BoardDocument): void {
  h.doc.transact(() => {
    h.meta.set("id", board.id);
    h.meta.set("name", board.name);
    h.meta.set("background", board.background);
    h.meta.set("createdAt", board.createdAt);
    board.objects.forEach((o, i) => {
      h.objects.set(o.id, toYShape({ order: i, ...o }));
    });
    board.strokes.forEach((s, i) => {
      h.strokes.set(s.id, toYShape({ order: i, ...s }));
    });
  }, SEED_ORIGIN);
}

/**
 * Incremental Y.Doc -> plain BoardDocument reader.
 *
 * Rendering and the widget layer compare by reference (e.g. the worksheet
 * resets its typed answers when `obj.questions` changes identity), so the
 * mirror must keep UNCHANGED shapes referentially stable across reads. It
 * caches the plain object per shape id; `invalidate*` drops only the ids a
 * transaction actually touched.
 */
export class DocMirror {
  private objCache = new Map<string, AnyBoardObject>();
  private strokeCache = new Map<string, Stroke>();

  constructor(private h: DocHandles) {}

  invalidateObject(id: string): void {
    this.objCache.delete(id);
  }
  invalidateStroke(id: string): void {
    this.strokeCache.delete(id);
  }

  /** Build the current BoardDocument view. `fallbackId` names docs whose meta
   *  hasn't synced yet (a freshly joined shared board). */
  read(fallbackId: string): BoardDocument {
    const objects: AnyBoardObject[] = [];
    const liveObj = new Set<string>();
    this.h.objects.forEach((ymap, id) => {
      liveObj.add(id);
      let o = this.objCache.get(id);
      if (!o) {
        o = fromYShape<AnyBoardObject>(ymap);
        this.objCache.set(id, o);
      }
      objects.push(o);
    });
    for (const id of [...this.objCache.keys()]) {
      if (!liveObj.has(id)) this.objCache.delete(id);
    }
    objects.sort(byOrder);

    const strokes: Stroke[] = [];
    const liveStk = new Set<string>();
    this.h.strokes.forEach((ymap, id) => {
      liveStk.add(id);
      let s = this.strokeCache.get(id);
      if (!s) {
        s = fromYShape<Stroke>(ymap);
        this.strokeCache.set(id, s);
      }
      strokes.push(s);
    });
    for (const id of [...this.strokeCache.keys()]) {
      if (!liveStk.has(id)) this.strokeCache.delete(id);
    }
    strokes.sort(byOrder);

    const meta = this.h.meta;
    return {
      id: (meta.get("id") as string) ?? fallbackId,
      name: (meta.get("name") as string) ?? UNTITLED_NAME,
      background: (meta.get("background") as BoardDocument["background"]) ?? "squared",
      objects,
      strokes,
      createdAt: (meta.get("createdAt") as number) ?? 0,
      updatedAt: Date.now(),
    };
  }
}
