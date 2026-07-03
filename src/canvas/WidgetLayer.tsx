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
// Presses on the widget's own controls (buttons, inputs) are left alone so the
// widget stays fully interactive whatever the active tool.

import { useBoardStore } from "@/board/store";
import { worldToScreen } from "@/board/geometry";
import { getTool } from "@/tools/registry";
import type { AnyBoardObject } from "@/board/types";

interface WidgetLayerProps {
  /** Open a widget's settings Dialog (EDIT flow); routed through App, same as
   *  BoardCanvas's onEditObject for canvas objects. */
  onEditObject?: (obj: AnyBoardObject) => void;
}

/** A press on one of the widget's own controls, not on its card/chrome. */
function onControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, input, select, textarea") != null
  );
}

export function WidgetLayer({ onEditObject }: WidgetLayerProps) {
  // Re-render on board (objects) or camera change.
  const objects = useBoardStore((s) => s.board.objects);
  const camera = useBoardStore((s) => s.camera);

  const widgets = objects.filter((o) => {
    const t = getTool(o.type);
    return t?.kind === "widget";
  });

  // Capture phase: the worksheet header's own drag handler stopPropagation()s,
  // and selection must land before the drag starts anyway.
  const selectWidget = (o: AnyBoardObject, e: React.PointerEvent) => {
    const st = useBoardStore.getState();
    if (st.tool !== "select" || onControl(e.target)) return;
    if (e.shiftKey) {
      const ids = st.selection.objectIds;
      st.setSelection({
        ...st.selection,
        objectIds: ids.includes(o.id)
          ? ids.filter((x) => x !== o.id)
          : [...ids, o.id],
      });
    } else if (!st.selection.objectIds.includes(o.id)) {
      st.select(o.id);
    }
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
            onPointerDownCapture={(e) => selectWidget(o, e)}
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
