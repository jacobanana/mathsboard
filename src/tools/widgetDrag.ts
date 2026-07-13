// Shared pointer-drag for a widget card's body, so an interactive widget
// (flashcards, money, dice, ...) responds to the active tool exactly like a
// canvas object does — rather than always moving, whatever tool is held.
//
// A widget is an HTML card layered ABOVE the <canvas>, so it swallows the
// press the canvas would otherwise route to the active interaction controller.
// Without this, every widget re-implemented "drag = move the object", which let
// the pan tool (and the pen, laser, ... tools) MOVE a widget even though the
// same drag only pans / draws over a canvas object. This helper reproduces the
// canvas behaviour instead:
//   - select : the drag MOVES the object (one undo step per drag), as before.
//   - pan    : the drag PANS the camera — you navigate past the widget, exactly
//              like dragging over any canvas object (the widget is never moved).
//   - other  : inert on the body; the drawing tools act on the canvas, never on
//              the overlay (a stroke would render under the card anyway).
// Presses on the widget's own controls (buttons, inputs, its scroll area) are
// the caller's to exclude before calling this — they stay live under every
// tool, so the card remains fully interactive.

import type React from "react";
import { useBoardStore } from "@/board/store";

/**
 * Start a tool-aware drag from a press on a widget card's body.
 *
 * @param origin  the object's world origin at press time (its {x, y}).
 * @param onTap   optional action for a press that DOESN'T become a drag (e.g.
 *                the dice's roll); fires on release under any tool.
 */
export function startWidgetCardDrag(
  e: React.PointerEvent<HTMLElement>,
  id: string,
  origin: { x: number; y: number },
  onTap?: () => void,
): void {
  // The tool at press time owns the whole gesture, mirroring the canvas host
  // (which keeps routing a live drag to the controller that received the down,
  // even if the tool switches mid-drag).
  const tool = useBoardStore.getState().tool;
  // This press is ours now: keep it off the canvas underneath.
  e.stopPropagation();
  const el = e.currentTarget;
  const scale = useBoardStore.getState().camera.scale;
  const cam = useBoardStore.getState().camera;
  const sx = e.clientX;
  const sy = e.clientY;
  let moved = false;
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  const mv = (ev: PointerEvent) => {
    if (!moved) {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
      moved = true;
      if (tool === "select") useBoardStore.getState().pushHistory();
    }
    const st = useBoardStore.getState();
    if (tool === "select") {
      st.moveObject(id, origin.x + (ev.clientX - sx) / scale, origin.y + (ev.clientY - sy) / scale);
    } else if (tool === "pan") {
      // Screen-pixel deltas, matching the pan controller (canvas/interactions/pan.ts).
      st.setCamera({ x: cam.x + (ev.clientX - sx), y: cam.y + (ev.clientY - sy) });
    }
    // Any other tool: the body press is inert (the tool has nothing to do to an
    // HTML overlay); the widget's own controls handled their presses already.
  };
  const up = () => {
    el.removeEventListener("pointermove", mv);
    el.removeEventListener("pointerup", up);
    if (!moved) onTap?.();
  };
  el.addEventListener("pointermove", mv);
  el.addEventListener("pointerup", up);
}
