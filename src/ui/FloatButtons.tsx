// The floating edit / delete buttons over the current selection (.floatbtn).
// Ported from the prototype (markup lines 118-119, updateOverlays line 335),
// extended to multi-select: these are the ONLY on-screen selection actions
// (the toolbar deliberately carries none), so Delete shows for any selection
// — single or multi — positioned at the combined bounding box. The Edit
// button appears only when exactly one OBJECT is selected (a stroke or a
// multi-select has no settings dialog). The Delete key works too.
//
// Positioned by projecting the selection's top-right corner to screen space
// via worldToScreen and clamping to the stage, like the prototype:
//   delete: left = clamp(tr.x - 6, 42, W - 36)
//   edit:   left = clamp(tr.x - 44, 2, W - 76)
//   both:   top  = clamp(tr.y - 34, 2, H - 36)
//
// The .floatbtn rule is position:absolute, so these must live INSIDE #stage to
// be positioned in canvas-relative space. BoardCanvas owns #stage and doesn't
// accept children, so we portal into it (the host passes the stage element).
//
// Edit delegates to the host (onEditSelected) so the same edit-routing as
// double-click is reused; delete calls store.deleteSelection directly.

import { createPortal } from "react-dom";
import { useBoardStore } from "@/board/store";
import { worldToScreen, clamp, strokeBounds } from "@/board/geometry";
import { DrawIcon, GLYPH } from "@/ui/icons";

interface FloatButtonsProps {
  /** The #stage element to portal into (null until BoardCanvas has mounted). */
  container: HTMLElement | null;
  onEditSelected: () => void;
}

export function FloatButtons({
  container,
  onEditSelected,
}: FloatButtonsProps): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
  const camera = useBoardStore((s) => s.camera);
  const selection = useBoardStore((s) => s.selection);
  const objects = useBoardStore((s) => s.board.objects);
  const strokes = useBoardStore((s) => s.board.strokes);
  const deleteSelection = useBoardStore((s) => s.deleteSelection);

  if (container == null) return null;
  if (tool !== "select") return null;
  if (selection.objectIds.length + selection.strokeIds.length === 0) return null;

  // Combined bounding box of everything selected (world coords).
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  for (const id of selection.objectIds) {
    const o = objects.find((obj) => obj.id === id);
    if (!o) continue;
    x1 = Math.min(x1, o.x);
    y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.w);
  }
  for (const id of selection.strokeIds) {
    const s = strokes.find((st) => st.id === id);
    if (!s) continue;
    const b = strokeBounds(s);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
  }
  if (!Number.isFinite(x1)) return null;

  // Editing settings only makes sense for a single placed object.
  const canEdit =
    selection.objectIds.length === 1 && selection.strokeIds.length === 0;

  const r = container.getBoundingClientRect();
  const W = r.width;
  const H = r.height;
  const tr = worldToScreen(camera, x2, y1);
  const top = clamp(tr.y - 34, 2, H - 36);

  return createPortal(
    <>
      {canEdit && (
        <button
          className="floatbtn show"
          id="floatEdit"
          title="Edit this object"
          style={{ left: clamp(tr.x - 44, 2, W - 76), top }}
          onClick={onEditSelected}
        >
          <DrawIcon />
        </button>
      )}
      <button
        className="floatbtn show"
        id="floatDel"
        title="Delete selection"
        style={{ left: clamp(tr.x - 6, 42, W - 36), top }}
        onClick={() => deleteSelection()}
      >
        {GLYPH.delete}
      </button>
    </>,
    container,
  );
}
