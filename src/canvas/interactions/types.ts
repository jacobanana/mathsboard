// THE INTERACTION-TOOL CONTRACT (T1 in docs/canvas-app-architecture.md).
//
// Interaction tools (ToolName: pen | text | math | eraser | select | pan) get the
// same treatment placeable tools already have in tools/registry.ts: each is a
// small controller object registered by tool name. The BoardCanvas host keeps
// only the SHARED input infrastructure — pointer bookkeeping, two-finger
// pinch/pan, capture, ignoreSingle, wheel — and dispatches everything else to
// the active controller. Adding an interactive tool = one new file + one
// registerInteraction(...) call; no host edits.
//
// Controllers own their live drag state as module/closure locals (the old
// strokeRef / movingRef / lassoRef / ... component refs). The host guarantees:
//   - onPointerDown fires only for the first, non-ignored pointer, with any
//     in-place editor (text or maths) already committed;
//   - onPointerMove / onPointerUp fire for tracked pointers only (onPointerUp
//     also receives pointercancel — check e.type when it matters);
//   - cancel() fires when a second finger lands (the tap becomes a pinch) —
//     abandon any live action without committing it;
//   - hoverCursor fires on bare hovers (no pointer down); it doubles as the
//     hover hook (e.g. the brush ring tracks here). Return a cursor to show,
//     or null to keep the tool's static `cursor`;
//   - drawOverlay runs after the scene on every redraw while the tool is
//     active (or while its interaction is still live), in world space.

import type { useBoardStore } from "@/board/store";
import type { AnyBoardObject, Camera, ToolName } from "@/board/types";
import type { Theme } from "@/styles/theme";

export interface Pt {
  x: number;
  y: number;
}

/** An in-place editor overlay, owned by the host (it holds the DOM) and
 *  registered against the object type it edits (canvas/editors.ts). Two
 *  exist today: the free-text <textarea> (canvas/textEditor.ts) and the
 *  MathLive maths editor (canvas/mathEditor.ts). Controllers and host guards
 *  reach every editor through the registry facade on InputCtx. */
export interface InPlaceEditorHandle {
  open(obj: AnyBoardObject, isNew: boolean): void;
  commit(): void;
  isOpen(): boolean;
}

/** The in-place editor REGISTRY as controllers see it: resolve by the
 *  object's type — controllers never name an editor. */
export interface EditorsHandle {
  /** Open the registered editor for obj.type (no-op if the type has none). */
  open(obj: AnyBoardObject, isNew: boolean): void;
  /** Commit whatever is open (the "tap elsewhere commits" rule). */
  commitAll(): void;
  anyOpen(): boolean;
}

/** Everything a controller can reach. One stable instance per canvas host. */
export interface InputCtx {
  /** The board store (use getState() — render fns must not be stale). */
  store: typeof useBoardStore;
  camera(): Camera;
  /** Screen (canvas-relative px) -> world for the live camera. */
  toWorld(sx: number, sy: number): Pt;
  /** Event client coords -> canvas-relative screen px. */
  evPos(e: PointerEvent | MouseEvent | WheelEvent): Pt;
  /** Request a scene redraw (rAF-batched; store changes redraw on their own —
   *  call this only when controller-local preview state changed). */
  render(): void;
  canvas: HTMLCanvasElement;
  /** The in-place editors, resolved by object type (canvas/editors.ts). */
  editors: EditorsHandle;
  /** Open an object's settings Dialog (the host-routed EDIT flow). */
  editObject(obj: AnyBoardObject): void;
}

/** Both scene layers, camera transform applied, for preview overlays. */
export interface OverlayKit {
  /** Template layer — draws UNDER committed ink (selection chrome). */
  back: CanvasRenderingContext2D;
  /** Ink layer — draws OVER committed ink (live stroke, brush ring). */
  ink: CanvasRenderingContext2D;
  camera: Camera;
  theme: Theme;
}

export interface InteractionController {
  readonly tool: ToolName;
  /** Static cursor while the tool is active (default "default"). */
  cursor?: string;
  /** Bare-hover hook; return a cursor override or null (see header). */
  hoverCursor?(e: PointerEvent, c: InputCtx): string | null;
  onPointerDown(e: PointerEvent, c: InputCtx): void;
  onPointerMove(e: PointerEvent, c: InputCtx): void;
  /** Also receives pointercancel. */
  onPointerUp(e: PointerEvent, c: InputCtx): void;
  /** A second finger landed: drop any live single-pointer action. */
  cancel?(c: InputCtx): void;
  onDoubleClick?(e: MouseEvent, c: InputCtx): void;
  /** Pointer left the canvas (hide hover previews). */
  onPointerLeave?(c: InputCtx): void;
  /** Contribute a preview overlay, drawn after the scene in world space. */
  drawOverlay?(kit: OverlayKit, c: InputCtx): void;
  /**
   * Selection chrome FOLLOWS THE SELECTION: the host draws the dashed
   * outlines for every tool (right after the scene, under the controller's
   * own overlay). A tool opts OUT by returning true here while its state
   * says so — the laser aims instead of selecting, so the select controller
   * suppresses the chrome in laser mode. Default: never suppressed.
   */
  suppressSelectionChrome?(
    st: ReturnType<InputCtx["store"]["getState"]>,
  ): boolean;
}
