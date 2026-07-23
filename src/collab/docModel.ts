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
import { migrateDocument } from "@/board/migrations";

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
    // The board's subject travels in meta too, so a document that round-trips
    // through a session (solo seed or shared join) keeps its flavour. Legacy
    // documents carry none; readers default it to maths (see subjectOf).
    if (board.subject) h.meta.set("subject", board.subject);
    // Custom content packs travel with the board (see BoardDocument). Stored as
    // one whole meta value (last-writer-wins) — they change rarely, only when the
    // set of imported content a board uses changes.
    if (board.contentPacks && board.contentPacks.length > 0) {
      h.meta.set("contentPacks", board.contentPacks);
    }
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
    const contentPacks = meta.get("contentPacks") as BoardDocument["contentPacks"];
    const subject = meta.get("subject") as BoardDocument["subject"];
    return {
      id: (meta.get("id") as string) ?? fallbackId,
      name: (meta.get("name") as string) ?? UNTITLED_NAME,
      background: (meta.get("background") as BoardDocument["background"]) ?? "squared",
      objects,
      strokes,
      createdAt: (meta.get("createdAt") as number) ?? 0,
      updatedAt: Date.now(),
      ...(subject ? { subject } : {}),
      ...(Array.isArray(contentPacks) && contentPacks.length > 0 ? { contentPacks } : {}),
    };
  }
}

/**
 * Reconcile one top-level shape map (objects or strokes) from its pre-migration
 * `before` list to the post-migration `next` list: delete vanished ids, insert
 * new shapes, and field-patch changed ones (setting changed fields, deleting
 * removed ones). Shapes unchanged by the migration share a reference across the
 * two lists and are skipped untouched.
 */
function reconcileShapeMap<T extends { id: string }>(
  map: Y.Map<Y.Map<unknown>>,
  before: T[],
  next: T[],
): void {
  const prevById = new Map(
    before.map((s) => [s.id, s as Record<string, unknown>]),
  );
  const keep = new Set(next.map((s) => s.id));
  for (const id of [...map.keys()]) if (!keep.has(id)) map.delete(id);
  for (const s of next) {
    const rec = s as Record<string, unknown>;
    const prev = prevById.get(s.id);
    if (prev === rec) continue; // untouched by the migration (same reference)
    const y = map.get(s.id);
    if (!y) {
      map.set(s.id, toYShape(rec)); // shape the migration added
      continue;
    }
    for (const [k, v] of Object.entries(rec)) if (y.get(k) !== v) y.set(k, v);
    if (prev) for (const k of Object.keys(prev)) if (!(k in rec)) y.delete(k);
  }
}

/**
 * Upgrade a live doc in place to the current shape schema, writing only the
 * differences under SEED_ORIGIN (so it is neither undoable nor treated as a user
 * edit). Used on the shared-join path: a board created before a migration
 * existed carries legacy shapes (e.g. a "wall"-mode fraction) that must be
 * upgraded once in the authoritative doc, rather than re-migrated on every read
 * by every client forever.
 *
 * It runs the SAME migrateDocument() registry as the local load paths — it holds
 * no per-migration knowledge, so a new migration needs no change here — then
 * diffs the result back per shape map. Object/scalar field-writes merge per-field
 * last-writer-wins, so two clients upgrading the same shape concurrently
 * converge, and the pass is idempotent once no legacy shape remains. (A migration
 * that adds/removes WHOLE shapes with fresh ids — e.g. eraser re-baking — is not
 * convergent under truly concurrent application; such migrations should run only
 * on local load, which shared docs already went through before being seeded.)
 */
export function migrateHandles(h: DocHandles): void {
  const current = new DocMirror(h).read(h.doc.guid);
  const migrated = migrateDocument(current);
  if (migrated === current) return; // already current -> no transaction, no sync
  h.doc.transact(() => {
    if (migrated.objects !== current.objects) {
      reconcileShapeMap(h.objects, current.objects, migrated.objects);
    }
    if (migrated.strokes !== current.strokes) {
      reconcileShapeMap(h.strokes, current.strokes, migrated.strokes);
    }
  }, SEED_ORIGIN);
}
