// THE IN-PLACE EDITOR REGISTRY (R4 in docs/tool-architecture-refactor.md).
//
// The canvas host owns the editor DOM (a positioned <textarea>, a MathLive
// overlay) but must not know the editors BY NAME: it registers each editor
// instance against the object type it edits, and every consumer — the host's
// commit-before-anything guards, the tap-edit controllers, editObjectAt —
// resolves through here. A new in-place-editable type registers its editor
// and declares `editWith: { inPlace: true }` on its tool; no host or
// controller edits.

import type { AnyBoardObject } from "@/board/types";
import type { InPlaceEditorHandle } from "@/canvas/interactions/types";

const EDITORS = new Map<string, InPlaceEditorHandle>();

/** Register the in-place editor for an object `type`. Returns the
 *  unregister cleanup — the canvas host mounts/unmounts editors with itself. */
export function registerInPlaceEditor(
  type: string,
  editor: InPlaceEditorHandle,
): () => void {
  EDITORS.set(type, editor);
  return () => {
    if (EDITORS.get(type) === editor) EDITORS.delete(type);
  };
}

/** Open the registered editor for the object's type. No-op (false) when the
 *  type has no in-place editor. */
export function openEditorFor(obj: AnyBoardObject, isNew: boolean): boolean {
  const e = EDITORS.get(obj.type);
  if (!e) return false;
  e.open(obj, isNew);
  return true;
}

/** Is any in-place editor currently open? (The host's pointer/wheel guards.) */
export function anyEditorOpen(): boolean {
  for (const e of EDITORS.values()) if (e.isOpen()) return true;
  return false;
}

/** Commit every open editor (at most one can be open, but the guard doesn't
 *  need to know that). */
export function commitAllEditors(): void {
  for (const e of EDITORS.values()) if (e.isOpen()) e.commit();
}
