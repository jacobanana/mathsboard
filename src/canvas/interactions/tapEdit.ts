// THE TAP-EDIT CONTROLLER FACTORY (R4 in docs/tool-architecture-refactor.md).
//
// Tools whose objects are created by tapping the board and edited in an
// in-place overlay (text, maths) share one gesture, written once here:
//
//   TAP        — re-open an existing object of the tool's type in its
//                registered in-place editor, or create a fresh one at the
//                point and edit it immediately.
//   CLICK-DRAG — (only when the spec provides dragCreate — the text box)
//                rubber-band a rectangle and create from it.
//
// Everything is DEFERRED to pointerup so a SECOND finger can cancel the
// gesture into a pinch/pan instead — the text tool used to open the editor on
// pointerdown, which the incoming second finger then committed-and-swallowed,
// so text was the one tool that could never two-finger zoom.
//
// Creation runs the shared ritual (board/commands.createObject): selected,
// the creating tool kept, tracking deferred to the editor's first non-empty
// commit. The editor itself is resolved by object type (canvas/editors.ts).

import { hitTest } from "@/board/geometry";
import { createObject } from "@/board/commands";
import type { AnyBoardObject, ToolName } from "@/board/types";
import type {
  InputCtx,
  InteractionController,
  Pt,
} from "@/canvas/interactions/types";

/** Screen-px movement past which a press is a drag, not a tap. */
const DRAG_PX = 8;

type BoardState = ReturnType<InputCtx["store"]["getState"]>;

export interface TapEditSpec {
  tool: ToolName;
  /** The object type this tool edits in place (a tap on one re-opens it). */
  type: string;
  /** Static cursor (default "text"). */
  cursor?: string;
  /** The fresh object for a TAP at world point `at`. */
  create(st: BoardState, at: Pt): AnyBoardObject;
  /** Optional CLICK-DRAG create: the object for a drag from world `a` to
   *  world `b` (the text box). Omit for tap-only tools (maths). */
  dragCreate?(st: BoardState, a: Pt, b: Pt): AnyBoardObject;
  /** Pointer-down hook (the maths tool prewarms its editor here). */
  onPress?(): void;
}

/** A press awaiting pointerup. `edit` is an existing object of the tool's
 *  type under the press (re-opened on a tap); `cur` is the live drag point
 *  once past the threshold (null = still a tap). */
interface Pending {
  pid: number;
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  edit: AnyBoardObject | null;
  cur: Pt | null;
}

export function makeTapEditController(
  spec: TapEditSpec,
): InteractionController {
  let pending: Pending | null = null;
  const isDrag = (p: Pending): boolean => p.cur != null;

  /** Create + open: the shared ritual, then straight into the in-place editor. */
  const createAndEdit = (c: InputCtx, obj: AnyBoardObject): void => {
    createObject(obj, { keepTool: true, deferTracking: true });
    c.editors.open(obj, true);
  };

  return {
    tool: spec.tool,
    cursor: spec.cursor ?? "text",

    onPointerDown(e, c) {
      spec.onPress?.();
      const st = c.store.getState();
      const pp = c.evPos(e);
      const w = c.toWorld(pp.x, pp.y);
      const hit = hitTest(st.board.objects, w.x, w.y);
      pending = {
        pid: e.pointerId,
        sx: pp.x,
        sy: pp.y,
        wx: w.x,
        wy: w.y,
        edit: hit && hit.type === spec.type ? hit : null,
        cur: null,
      };
    },

    onPointerMove(e, c) {
      if (!spec.dragCreate) return; // tap-only tools resolve on release
      if (!pending || e.pointerId !== pending.pid) return;
      const pp = c.evPos(e);
      // Stay a tap until the pointer leaves the tap tolerance; then it's a drag.
      if (
        !isDrag(pending) &&
        Math.hypot(pp.x - pending.sx, pp.y - pending.sy) <= DRAG_PX
      ) {
        return;
      }
      pending.cur = c.toWorld(pp.x, pp.y);
      c.render();
    },

    onPointerUp(e, c) {
      if (!pending || e.pointerId !== pending.pid) return;
      const pt = pending;
      pending = null;
      // pointercancel = the system took over (scroll/palm); drop the gesture.
      if (e.type === "pointercancel") {
        c.render();
        return;
      }
      const st = c.store.getState();

      if (isDrag(pt)) {
        createAndEdit(
          c,
          spec.dragCreate!(st, { x: pt.wx, y: pt.wy }, pt.cur!),
        );
        c.render(); // clear the drag-preview rectangle
        return;
      }

      // Tap: re-open an existing object of this type, or create fresh.
      if (pt.edit) {
        st.select(pt.edit.id);
        c.editors.open(pt.edit, false);
        return;
      }
      createAndEdit(c, spec.create(st, { x: pt.wx, y: pt.wy }));
    },

    // The rubber-band rectangle while dragging a new box. (The dashed frame
    // that marks a selected object as editable is host-drawn chrome.)
    drawOverlay(kit, _c) {
      if (!pending || !isDrag(pending)) return;
      const { back, camera, theme } = kit;
      const x = Math.min(pending.wx, pending.cur!.x);
      const y = Math.min(pending.wy, pending.cur!.y);
      const w = Math.abs(pending.cur!.x - pending.wx);
      const h = Math.abs(pending.cur!.y - pending.wy);
      back.save();
      back.strokeStyle = theme.accent;
      back.lineWidth = 1.5 / camera.scale;
      back.setLineDash([6 / camera.scale, 4 / camera.scale]);
      back.strokeRect(x, y, w, h);
      back.restore();
    },

    // A deferred gesture becomes a pinch: drop it and clear any preview.
    cancel(c) {
      pending = null;
      c.render();
    },
  };
}
