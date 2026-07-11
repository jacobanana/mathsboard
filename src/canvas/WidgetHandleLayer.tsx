// Resize handles for widget objects. Canvas objects get their handles painted
// on the board (select.ts drawOverlay), but a widget is an HTML card layered
// ABOVE the canvas — a canvas-drawn handle would sit under it, invisible and
// unclickable. So this layer floats real DOM handles over the single selected
// resizable widget instead, reusing the same resize math and store action as
// the canvas path (board/resize.ts resizeRect + store.resizeObject). The box
// stays aspect-locked, exactly like a canvas resize.
//
// A widget opts in with `resizable: true` (registry.ts). Handles show only with
// the select tool active and exactly one such widget selected — mirroring the
// canvas's singleResizableObject gating.

import { useRef } from "react";
import { useBoardStore } from "@/board/store";
import {
  handleCenters,
  screenToWorld,
  snapPt,
  worldToScreen,
  RESIZE_HANDLES,
} from "@/board/geometry";
import type { ResizeHandle } from "@/board/geometry";
import { RESIZE_CURSOR, resizeRect } from "@/board/resize";
import { getTool } from "@/tools/registry";

/** Screen padding (px) of the handle box outside the widget, matching the
 *  canvas selection frame (select.ts drawOverlay uses pad = 8/scale world). */
const PAD = 8;

export function WidgetHandleLayer(): JSX.Element {
  // Re-render on board (box), camera, selection or tool change.
  const objects = useBoardStore((s) => s.board.objects);
  const camera = useBoardStore((s) => s.camera);
  const selection = useBoardStore((s) => s.selection);
  const tool = useBoardStore((s) => s.tool);
  const laserMode = useBoardStore((s) => s.laserMode);
  const layerRef = useRef<HTMLDivElement>(null);

  // The single selected resizable widget, or nothing. Mirrors the canvas's
  // singleResizableObject: exactly one object, no strokes, select tool, not
  // laser — but for a widget tool that has opted into resizing.
  const target =
    tool === "select" &&
    !laserMode &&
    selection.objectIds.length === 1 &&
    selection.strokeIds.length === 0
      ? objects.find((x) => x.id === selection.objectIds[0])
      : undefined;
  const t = target && getTool(target.type);
  const o =
    target && t && t.kind === "widget" && t.resizable ? target : null;
  // A widget whose layout reflows to any box resizes on both axes freely.
  const freeAspect = !!(t && t.kind === "widget" && t.freeAspect);

  if (!o) return <div className="whandle-layer" ref={layerRef} />;

  const pad = PAD / camera.scale; // world units -> constant screen padding
  const centers = handleCenters(o, pad);

  const startResize = (
    handle: ResizeHandle,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    // Don't let the press reach the widget (its drag-to-move) or the canvas.
    e.stopPropagation();
    e.preventDefault();
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect(); // layer origin, for screen->world
    const el = e.currentTarget;
    const start = { x: o.x, y: o.y, w: o.w, h: o.h };
    let moved = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const mv = (ev: PointerEvent) => {
      const st = useBoardStore.getState();
      const wpt = screenToWorld(
        st.camera,
        ev.clientX - rect.left,
        ev.clientY - rect.top,
      );
      // Grid snapping, mirroring the canvas resize (select.ts `snapping`): snap
      // on squared paper when the toggle is on; Shift flips it, Alt bypasses.
      const snap =
        st.snap !== ev.shiftKey && st.board.background === "squared" && !ev.altKey;
      const p = snap ? snapPt(wpt) : wpt;
      const box = resizeRect(start, handle, p.x, p.y, freeAspect);
      const cur = st.board.objects.find((x) => x.id === o.id);
      if (
        cur &&
        (cur.x !== box.x ||
          cur.y !== box.y ||
          cur.w !== box.w ||
          cur.h !== box.h)
      ) {
        if (!moved) {
          st.pushHistory(); // one undo step per resize drag
          moved = true;
        }
        st.resizeObject(o.id, box);
      }
    };
    const up = () => {
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
  };

  return (
    <div className="whandle-layer" ref={layerRef}>
      {RESIZE_HANDLES.map((h) => {
        const c = worldToScreen(camera, centers[h].x, centers[h].y);
        return (
          <div
            key={h}
            className="whandle"
            style={{ left: c.x, top: c.y, cursor: RESIZE_CURSOR[h] }}
            onPointerDown={(e) => startResize(h, e)}
          />
        );
      })}
    </div>
  );
}
