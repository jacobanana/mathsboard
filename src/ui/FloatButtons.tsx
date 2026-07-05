// The floating action bar over the current selection (#floatbar). These are
// the ONLY on-screen selection actions (the toolbar deliberately carries
// none): delete always; edit + rotate for a single object; z-order and
// group/ungroup for everything — so grouping IS reachable on touch devices,
// where Ctrl+G doesn't exist.
//
// One flex CONTAINER positioned at the selection's top-right corner and
// clamped into the stage as a whole — individually clamped buttons used to
// pile up on top of each other at the screen edge on phones, hiding the
// leftmost actions. Every button shares the .floatbtn look (same dark disc,
// same icon size — styled once in CSS).
//
// The .floatbar rule is position:absolute, so this must live INSIDE #stage to
// be positioned in canvas-relative space. BoardCanvas owns #stage and doesn't
// accept children, so we portal into it (the host passes the stage element).
//
// Edit delegates to the host (onEditSelected) so the same edit-routing as
// double-click is reused; delete calls store.deleteSelection directly.

import { createPortal } from "react-dom";
import { useBoardStore } from "@/board/store";
import { worldToScreen, clamp, strokeBounds } from "@/board/geometry";
import {
  arrangeSelection,
  groupSelection,
  rotatableSelection,
  rotateSelection,
  ungroupSelection,
} from "@/board/commands";
import { keyHint } from "@/ui/shortcuts";
import {
  BringToFrontIcon,
  DrawIcon,
  GroupIcon,
  RotateLeftIcon,
  RotateRightIcon,
  SendToBackIcon,
  UngroupIcon,
  GLYPH,
} from "@/ui/icons";

interface FloatButtonsProps {
  /** The #stage element to portal into (null until BoardCanvas has mounted). */
  container: HTMLElement | null;
  onEditSelected: () => void;
}

/** Button slot width: 34px disc + 4px gap (must match the CSS). */
const SLOT = 38;

export function FloatButtons({
  container,
  onEditSelected,
}: FloatButtonsProps): JSX.Element | null {
  const camera = useBoardStore((s) => s.camera);
  const selection = useBoardStore((s) => s.selection);
  const objects = useBoardStore((s) => s.board.objects);
  const strokes = useBoardStore((s) => s.board.strokes);
  const laserMode = useBoardStore((s) => s.laserMode);
  const editingId = useBoardStore((s) => s.editingId);
  const deleteSelection = useBoardStore((s) => s.deleteSelection);

  if (container == null) return null;
  // Chrome follows the SELECTION, not the tool: the bar shows in every tool
  // (Delete and arrow-nudge already worked everywhere, so the affordances
  // should too). Two declared exceptions: the laser is aiming, not selecting;
  // and an open in-place editor is its own chrome (the bar would sit on it).
  if (laserMode || editingId != null) return null;
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
  const canRotate = rotatableSelection() != null;
  const count = selection.objectIds.length + selection.strokeIds.length;
  // Group when 2+ shapes are selected; ungroup when any selected shape is
  // grouped (the two swap — a selected group offers ungroup).
  const anyGrouped =
    selection.objectIds.some((id) => objects.find((o) => o.id === id)?.groupId) ||
    selection.strokeIds.some((id) => strokes.find((s) => s.id === id)?.groupId);

  // Left-to-right; delete stays rightmost (its old spot).
  const buttons: {
    id: string;
    title: string;
    body: JSX.Element | string;
    onClick: () => void;
  }[] = [];
  if (anyGrouped) {
    buttons.push({
      id: "floatGroup",
      title: `Ungroup (${keyHint("ungroup")})`,
      body: <UngroupIcon />,
      onClick: () => ungroupSelection(),
    });
  } else if (count > 1) {
    buttons.push({
      id: "floatGroup",
      title: `Group the selection (${keyHint("group")})`,
      body: <GroupIcon />,
      onClick: () => groupSelection(),
    });
  }
  buttons.push(
    {
      id: "floatBack",
      title: `Send to back (${keyHint("toBack")})`,
      body: <SendToBackIcon />,
      onClick: () => arrangeSelection("back"),
    },
    {
      id: "floatFront",
      title: `Bring to front (${keyHint("toFront")})`,
      body: <BringToFrontIcon />,
      onClick: () => arrangeSelection("front"),
    },
  );
  if (canRotate) {
    buttons.push(
      {
        id: "floatRotL",
        title: "Rotate 15° anticlockwise",
        body: <RotateLeftIcon />,
        onClick: () => rotateSelection(-15),
      },
      {
        id: "floatRotR",
        title: "Rotate 15° clockwise",
        body: <RotateRightIcon />,
        onClick: () => rotateSelection(15),
      },
    );
  }
  if (canEdit) {
    buttons.push({
      id: "floatEdit",
      title: "Edit this object",
      body: <DrawIcon />,
      onClick: onEditSelected,
    });
  }
  buttons.push({
    id: "floatDel",
    title: "Delete selection",
    body: GLYPH.delete,
    onClick: () => deleteSelection(),
  });

  const r = container.getBoundingClientRect();
  const W = r.width;
  const H = r.height;
  const tr = worldToScreen(camera, x2, y1);
  const width = buttons.length * SLOT - 4; // last button carries no gap
  // Right edge of the bar sits at the old delete-button spot (tr.x + 28),
  // then the WHOLE bar clamps into the stage so nothing overlaps or hides.
  // 48 up clears the selection frame + its handles (frame ~8px above the
  // shape, handles a few px more) so the bar never sits on the shape itself.
  const left = clamp(tr.x + 28 - width, 2, Math.max(2, W - width - 2));
  const top = clamp(tr.y - 48, 2, H - 36);

  return createPortal(
    <div id="floatbar" style={{ left, top }}>
      {buttons.map((b) => (
        <button
          key={b.id}
          className="floatbtn"
          id={b.id}
          title={b.title}
          onClick={b.onClick}
        >
          {b.body}
        </button>
      ))}
    </div>,
    container,
  );
}
