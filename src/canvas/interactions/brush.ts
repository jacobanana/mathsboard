// Pen + eraser interaction controllers. The two share one implementation: a
// live stroke accumulated in world coords, previewed on the ink layer, then
// committed on release — as ink (pen) or as a geometric erase pass (eraser).

import { screenToWorld } from "@/board/geometry";
import { drawStrokeFull } from "@/canvas/drawHelpers";
import { id as newId } from "@/board/types";
import type { Stroke } from "@/board/types";
import type {
  InteractionController,
  Pt,
} from "@/canvas/interactions/types";

/** The in-progress stroke, held outside React/store (no re-render churn). */
interface LiveStroke {
  pid: number;
  mode: "pen" | "eraser";
  color: string;
  size: number;
  points: Pt[];
}

function makeBrushController(mode: "pen" | "eraser"): InteractionController {
  let live: LiveStroke | null = null;
  // Last pointer position (screen px) while the brush is over the canvas, so
  // the ink layer can draw a light ring showing the brush footprint. The ring
  // IS the cursor for these tools (static cursor "none"). Null when the
  // pointer is off-canvas.
  let cursorAt: Pt | null = null;

  return {
    tool: mode,
    // The ring + centre dot ARE the cursor — a separate crosshair reads as
    // off-centre next to the ring, so the native one is hidden.
    cursor: "none",

    // Track the bare hover so the brush ring follows the cursor even before a
    // stroke begins. (Cursor override stays null: keep "none".)
    hoverCursor(e, c) {
      cursorAt = c.evPos(e);
      c.render();
      return null;
    },

    onPointerDown(e, c) {
      const st = c.store.getState();
      const cam = c.camera();
      const pp = c.evPos(e);
      cursorAt = pp;
      live = {
        pid: e.pointerId,
        mode,
        color: st.color,
        // penSize/eraserSize are screen px; store the world-space width.
        size: (mode === "eraser" ? st.eraserSize : st.penSize) / cam.scale,
        points: [c.toWorld(pp.x, pp.y)],
      };
      c.render();
    },

    onPointerMove(e, c) {
      if (!live || e.pointerId !== live.pid) return;
      const pp = c.evPos(e);
      cursorAt = pp; // keep the brush ring on the cursor tip
      live.points.push(c.toWorld(pp.x, pp.y));
      c.render();
    },

    onPointerUp(e, c) {
      if (!live || e.pointerId !== live.pid) return;
      const st = c.store.getState();
      const s = live;
      live = null;
      if (s.mode === "eraser") {
        // Geometric erase: trim covered points out of the pen strokes (the
        // eraser is never stored, so gaps move with the stroke). The render
        // below runs unconditionally to clear the live eraser preview even
        // when nothing was erased.
        st.eraseStrokes({ points: s.points, size: s.size });
      } else {
        const finished: Stroke = {
          id: newId(),
          mode: s.mode,
          color: s.color,
          size: s.size,
          points: s.points,
        };
        st.addStroke(finished); // pushes history + appends
      }
      c.render();
    },

    cancel(c) {
      if (live) {
        live = null;
        c.render();
      }
    },

    // Hide the ring once the cursor leaves the canvas (but not mid-stroke,
    // where the next move re-anchors it and would only flicker).
    onPointerLeave(c) {
      if (cursorAt && !live) {
        cursorAt = null;
        c.render();
      }
    },

    drawOverlay(kit, c) {
      // Re-paint the in-progress live stroke on top of the committed ink.
      if (live) drawStrokeFull(kit.ink, live);

      // Brush cursor ring: a light circle the exact size of the pen / eraser
      // footprint. The diameter is a screen-px value, so the world radius
      // scales with zoom.
      if (!cursorAt) return;
      const st = c.store.getState();
      const diam = mode === "eraser" ? st.eraserSize : st.penSize;
      const cam = kit.camera;
      const w = screenToWorld(cam, cursorAt.x, cursorAt.y);
      const ictx = kit.ink;
      ictx.save();
      ictx.beginPath();
      ictx.arc(w.x, w.y, diam / 2 / cam.scale, 0, Math.PI * 2);
      ictx.fillStyle = "rgba(126,152,151,0.12)";
      ictx.fill();
      ictx.lineWidth = 1.5 / cam.scale;
      ictx.strokeStyle = kit.theme.muted;
      ictx.stroke();
      // Centre dot: the exact aim point (stays visible even when the ring is
      // barely larger than it, e.g. the small pen).
      ictx.beginPath();
      ictx.arc(w.x, w.y, 1.5 / cam.scale, 0, Math.PI * 2);
      ictx.fillStyle = kit.theme.muted;
      ictx.fill();
      ictx.restore();
    },
  };
}

export const penController = makeBrushController("pen");
export const eraserController = makeBrushController("eraser");
