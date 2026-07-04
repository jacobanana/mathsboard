// DOCUMENT MIGRATIONS: one place for every "load an old board, upgrade it in
// flight" transform, and ONE registry (MIGRATIONS below) that is the single
// source of truth for which migrations exist and in what order.
//
// Every consumer runs the registry through migrateDocument() and knows nothing
// about the individual migrations: the store's load paths (draft resume /
// library open) and the shared-doc upgrade in docModel.ts both just call
// migrateDocument(). So adding the 100th migration is a ONE-LINE change here —
// write the pure transform, append it to MIGRATIONS, cover it in
// migrations.test.ts — and no call site anywhere else changes.
//
// The identity contract makes that scale cheaply: every migration returns its
// input BY REFERENCE when it changes nothing, so migrateDocument() returns the
// SAME document for an already-current board (no allocation, and callers can
// skip persisting / re-rendering).

import type { AnyBoardObject, BoardDocument, Stroke } from "@/board/types";
import { applyEraser } from "@/board/geometry";
import { paramsOf, scaleOf, sizedBox } from "@/board/sizing";

/**
 * Fold every stored "eraser" overlay stroke into the pen strokes that precede it
 * (the eraser only carved pixels drawn before it), leaving pen strokes only.
 * This upgrades documents from the old overlay-eraser model to the geometric one
 * where erased gaps move with their stroke. Idempotent once no erasers remain.
 */
export function bakeErasers(strokes: Stroke[]): Stroke[] {
  if (!strokes.some((s) => s.mode === "eraser")) return strokes;
  let pens: Stroke[] = [];
  for (const s of strokes) {
    if (s.mode === "eraser") pens = applyEraser(pens, s.points, s.size);
    else pens.push(s);
  }
  return pens;
}

/**
 * Rewrite legacy Fractions objects saved with the removed "wall" mode into the
 * standalone `fractionwall` tool. A wall never carried bars/parts, so drawing it
 * through the pared-down Fractions tool would throw; rewrite it in place. Its
 * bounding box is unchanged (the wall's size was always {480, max*34}, which the
 * new tool reproduces exactly). Idempotent once no such objects remain.
 */
export function bakeFractionWalls(objects: AnyBoardObject[]): AnyBoardObject[] {
  if (!objects.some((o) => o.type === "fraction" && o.mode === "wall")) {
    return objects;
  }
  return objects.map((o) => {
    if (o.type !== "fraction" || o.mode !== "wall") return o;
    const migrated: AnyBoardObject = {
      id: o.id,
      type: "fractionwall",
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      max: typeof o.max === "number" ? o.max : 8,
    };
    if (typeof o.order === "number") migrated.order = o.order;
    return migrated;
  });
}

/**
 * Migrate documents off the old create-time `fill` (show-answer) flag. Answer
 * reveal is now SYSTEMIC runtime state (`revealed`, flipped by the board's
 * reveal button under INPUT_ORIGIN), not a baked-in tool param — so a saved
 * `fill: true` becomes `revealed: true` and the `fill` field is dropped.
 *
 * Several tools (chunking, long division, fraction/percentage of an amount)
 * used to GROW when filled but now reserve the answer's space always, so a
 * legacy object saved HIDDEN carries a too-short box. We re-derive the box from
 * the tool's CURRENT natural size at the object's existing resize scale — the
 * same rule editObject uses (sizedBox at scaleOf) — so the box matches what the
 * tool now draws. If the tool isn't registered (naturalSize null), the box is
 * left as-is and only the field rename happens. Idempotent: once no object
 * carries `fill`, the pass returns its input array unchanged (identity contract).
 */
export function revealFromFill(objects: AnyBoardObject[]): AnyBoardObject[] {
  if (!objects.some((o) => "fill" in o)) return objects;
  return objects.map((o) => {
    if (!("fill" in o)) return o;
    const { fill, ...rest } = o;
    const next: AnyBoardObject = { ...rest };
    if (fill) next.revealed = true; // keep a shown worked example shown
    const box = sizedBox(next.type, paramsOf(next), scaleOf(next));
    if (box) {
      next.w = box.w;
      next.h = box.h;
    }
    return next;
  });
}

// --- the registry ---------------------------------------------------------

/**
 * A migration upgrades a whole document and MUST preserve reference identity
 * when it changes nothing (return the same doc, and the same objects/strokes
 * arrays), so the composition below can no-op an already-current board.
 */
type Migration = (doc: BoardDocument) => BoardDocument;

/** Lift an objects-only transform into a Migration, keeping the identity contract. */
const onObjects =
  (fn: (o: AnyBoardObject[]) => AnyBoardObject[]): Migration =>
  (doc) => {
    const objects = fn(doc.objects);
    return objects === doc.objects ? doc : { ...doc, objects };
  };

/** Lift a strokes-only transform into a Migration, keeping the identity contract. */
const onStrokes =
  (fn: (s: Stroke[]) => Stroke[]): Migration =>
  (doc) => {
    const strokes = fn(doc.strokes);
    return strokes === doc.strokes ? doc : { ...doc, strokes };
  };

/**
 * THE registry — the only place a migration is registered, oldest first. Append
 * new migrations to the end. A migration that spans both objects and strokes can
 * be written as a raw `(doc) => doc` instead of via the lifters above.
 */
const MIGRATIONS: Migration[] = [
  onStrokes(bakeErasers),
  onObjects(bakeFractionWalls),
  onObjects(revealFromFill),
];

/**
 * Run every registered migration over a freshly loaded document. Returns the
 * SAME document reference when nothing needed upgrading (see the identity
 * contract above), so callers can cheaply detect "no change". Call this on every
 * load path before handing a document to a session, and from the shared-doc
 * upgrade in docModel.ts.
 */
export function migrateDocument(doc: BoardDocument): BoardDocument {
  return MIGRATIONS.reduce((d, migrate) => migrate(d), doc);
}
