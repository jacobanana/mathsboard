// Overlay layer for interactive WidgetTool objects (e.g. the type-and-check
// worksheet). Canvas objects draw onto the <canvas>; widget objects render as
// real React components positioned over the board.
//
// Ported from positionWidget / positionWidgets (maths-whiteboard.html lines
// 587-588): each widget is absolutely placed via worldToScreen and scaled by
// the camera scale (transform-origin 0 0, as set by .iworksheet in the CSS).
// The layer itself (.ilayer) is pointer-events:none; each widget re-enables
// pointer events for itself.
//
// SELECTION: because a widget card swallows pointer events, the canvas
// hit-test never sees it — without help, a widget could only ever be selected
// by whoever placed it (auto-select on insert) or via lasso/Ctrl+A. The
// wrapper therefore mirrors the canvas selection gestures itself, so EVERY
// collaborator can select (then delete/edit via toolbar, float buttons or the
// Delete key) any widget:
//   - Select tool + press on the card  -> select it (shift toggles membership)
//   - double-click on the card          -> open its settings Dialog
//   - LONG PRESS on the card's top bar  -> ask to delete it
// Presses on the widget's own controls (buttons, inputs) are left alone so the
// widget stays fully interactive whatever the active tool.
//
// GESTURES: every press here is also registered with canvas/gestures, the
// shared multi-touch registry the canvas uses. That is what makes a two-finger
// zoom work when one finger is resting on a widget — the canvas never sees
// that finger, so before this the gesture was one short of a pinch and became
// a widget drag instead. While the pinch runs, the capture-phase handlers stop
// the event before the card's own drag logic ever sees it.

import { useCallback, useEffect, useRef } from "react";
import { useBoardStore } from "@/board/store";
import { worldToScreen } from "@/board/geometry";
import { pressSelection } from "@/board/selection";
import * as gestures from "@/canvas/gestures";
import { getTool } from "@/tools/registry";
import type { AnyBoardObject } from "@/board/types";

/** Hold this long on a widget's top bar to be asked about deleting it. */
const LONG_PRESS_MS = 550;
/** Move further than this and the hold was a drag, not a long press (px). */
const LONG_PRESS_SLOP = 8;

interface WidgetLayerProps {
  /** Open a widget's settings Dialog (EDIT flow); routed through App, same as
   *  BoardCanvas's onEditObject for canvas objects. */
  onEditObject?: (obj: AnyBoardObject) => void;
  /** Ask to delete a widget (the long press on its top bar). Routed through
   *  App, which opens the confirmation. */
  onDeleteObject?: (obj: AnyBoardObject) => void;
}

/** A press on one of the widget's own controls, not on its card/chrome. */
function onControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, input, select, textarea") != null
  );
}

/**
 * Is this press on the part of the card the long press owns? A widget with a
 * top bar (.widget-head — the games, the worksheet, the vocabulary table)
 * takes it there only, so a press in the middle of an activity is never a
 * delete; a card with no bar at all (the die, the timer) takes it anywhere off
 * its controls.
 */
function onDeleteZone(wrapper: HTMLElement, target: EventTarget | null): boolean {
  if (onControl(target)) return false;
  const head = wrapper.querySelector(".widget-head");
  if (!head) return true;
  return target instanceof Node && head.contains(target);
}

export function WidgetLayer({ onEditObject, onDeleteObject }: WidgetLayerProps) {
  // Re-render on board (objects) or camera change.
  const objects = useBoardStore((s) => s.board.objects);
  const camera = useBoardStore((s) => s.camera);

  const widgets = objects.filter((o) => {
    const t = getTool(o.type);
    return t?.kind === "widget";
  });

  // The armed long press: which finger, where it started, and its timer.
  const hold = useRef<{
    pid: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const cancelHold = useCallback(() => {
    if (!hold.current) return;
    clearTimeout(hold.current.timer);
    hold.current = null;
  }, []);
  useEffect(() => cancelHold, [cancelHold]);

  // Capture phase: the worksheet header's own drag handler stopPropagation()s,
  // and selection must land before the drag starts anyway. Same press rule as
  // the canvas (board/selection.ts pressSelection), so groups and shift-toggle
  // behave identically on widgets. The click-collapse intent is deliberately
  // not applied here: a widget press can't be told apart from the widget's own
  // header-drag start, so collapsing would fire on drags too.
  const selectWidget = (o: AnyBoardObject, e: React.PointerEvent) => {
    const st = useBoardStore.getState();
    if (st.tool !== "select" || onControl(e.target)) return;
    const { selection } = pressSelection(
      st.board,
      st.selection,
      "object",
      o.id,
      e.shiftKey,
    );
    if (selection !== st.selection) st.setSelection(selection);
  };

  const onDown = (o: AnyBoardObject, e: React.PointerEvent<HTMLElement>) => {
    // The gesture layer takes the finger first. Once it owns a pinch, the card
    // must not also drag — stop the event before it reaches the widget.
    if (gestures.down(e.pointerId, gestures.pos(e))) {
      cancelHold();
      e.stopPropagation();
      return;
    }
    cancelHold();
    if (onDeleteObject && onDeleteZone(e.currentTarget, e.target)) {
      const timer = setTimeout(() => {
        hold.current = null;
        navigator.vibrate?.(15); // a nudge that the hold registered
        onDeleteObject(o);
      }, LONG_PRESS_MS);
      hold.current = { pid: e.pointerId, x: e.clientX, y: e.clientY, timer };
    }
    selectWidget(o, e);
  };

  const onMove = (e: React.PointerEvent) => {
    if (gestures.move(e.pointerId, gestures.pos(e))) {
      cancelHold();
      e.stopPropagation(); // the pinch owns the gesture; no card drag
      return;
    }
    const h = hold.current;
    if (!h || h.pid !== e.pointerId) return;
    const far =
      Math.abs(e.clientX - h.x) + Math.abs(e.clientY - h.y) > LONG_PRESS_SLOP;
    if (far) cancelHold(); // they're dragging the card, not holding it
  };

  // Never stopped, even mid-pinch: the card's own pointerup is how its drag
  // listeners come off.
  const onUp = (e: React.PointerEvent) => {
    if (hold.current?.pid === e.pointerId) cancelHold();
    gestures.up(e.pointerId);
  };

  // Mirrors BoardCanvas's onDblClick for canvas objects (select | pan tools).
  const editWidget = (o: AnyBoardObject, e: React.MouseEvent) => {
    const st = useBoardStore.getState();
    if (st.tool !== "select" && st.tool !== "pan") return;
    if (onControl(e.target)) return;
    st.select(o.id);
    onEditObject?.(o);
  };

  return (
    <div className="ilayer">
      {widgets.map((o) => {
        const t = getTool(o.type);
        if (!t || t.kind !== "widget") return null;
        const s = worldToScreen(camera, o.x, o.y);
        const Component = t.Component;
        // Generic positioner only — each widget renders its own card (e.g. the
        // worksheet's .iworksheet), so we don't double-wrap with that class.
        return (
          <div
            key={o.id}
            style={{
              position: "absolute",
              left: s.x + "px",
              top: s.y + "px",
              transform: "scale(" + camera.scale + ")",
              transformOrigin: "0 0",
            }}
            onPointerDownCapture={(e) => onDown(o, e)}
            onPointerMoveCapture={onMove}
            onPointerUpCapture={onUp}
            onPointerCancelCapture={onUp}
            onDoubleClick={(e) => editWidget(o, e)}
          >
            <Component
              obj={o as AnyBoardObject as never}
              onEdit={onEditObject ? () => onEditObject(o) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
