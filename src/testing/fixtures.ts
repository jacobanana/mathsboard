// Shared fixtures for the Vitest behavioural suite (src/**/*.test.ts).
//
// The tests drive the SAME seams the real UI drives — store actions,
// interaction controllers via InputCtx, handleShortcut — and assert only on
// observable outcomes (the board document, the selection, localStorage, the
// undo flags). These helpers set up that world:
//
//   freshBoard()   a clean solo session (real local Y.Doc, real UndoManager)
//                  with the store's ephemeral state reset and localStorage
//                  emptied — the unit-test equivalent of a page load.
//   aStroke() /    document-shape builders with sensible defaults; override
//   anObject()     what the test cares about.
//   fakeInputCtx() an InputCtx for driving interaction controllers headlessly.
//   pointer() /    plain event objects carrying just the fields the handlers
//   keydown()      read (jsdom cannot fabricate targeted trusted events).
//
// Deliberately vitest-free so it typechecks inside the app project.

import { useBoardStore } from "@/board/store";
import * as session from "@/collab/session";
import { screenToWorld } from "@/board/geometry";
import { id as newId, newBoardDocument } from "@/board/types";
import type { AnyBoardObject, BoardDocument, Stroke } from "@/board/types";
import type { InputCtx } from "@/canvas/interactions/types";
import { theme } from "@/styles/theme";

/**
 * Start a clean solo session seeded from a fresh document (optionally with
 * content) and reset every ephemeral store field to its boot value. Seeded
 * shapes get their array index as z-order, so draw order is deterministic.
 */
export function freshBoard(partial: Partial<BoardDocument> = {}): BoardDocument {
  localStorage.clear();
  const doc: BoardDocument = { ...newBoardDocument(), ...partial };
  const board = session.startSolo(doc);
  useBoardStore.setState({
    board,
    sourceId: null,
    dirty: false,
    camera: { x: 0, y: 0, scale: 1 },
    tool: "pen",
    color: theme.ink,
    penSize: 6,
    textSize: 26,
    mathSize: 26,
    eraserSize: 45,
    drawMode: "free",
    fillColor: "none",
    polygonSides: 5,
    aspectLock: false,
    snap: true,
    selection: { objectIds: [], strokeIds: [] },
    editingId: null,
    canUndo: false,
    canRedo: false,
  });
  return board;
}

/** A pen stroke: a horizontal line from (0,0) to (100,0), size 6. */
export function aStroke(over: Partial<Stroke> = {}): Stroke {
  return {
    id: newId(),
    mode: "pen",
    color: theme.ink,
    size: 6,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    ...over,
  };
}

/** A numberline object at its natural size (so its resize scale is 1). */
export function anObject(over: Partial<AnyBoardObject> = {}): AnyBoardObject {
  return {
    id: newId(),
    type: "numberline",
    x: 0,
    y: 0,
    w: 540,
    h: 64,
    start: 0,
    step: 1,
    intervals: 10,
    hide: false,
    ...over,
  };
}

/**
 * An InputCtx for driving interaction controllers without a canvas host.
 * evPos maps event client coords straight to screen px, so with the default
 * identity camera, pointer coordinates ARE world coordinates.
 */
export function fakeInputCtx(over: Partial<InputCtx> = {}): InputCtx {
  return {
    store: useBoardStore,
    camera: () => useBoardStore.getState().camera,
    toWorld: (sx, sy) =>
      screenToWorld(useBoardStore.getState().camera, sx, sy),
    evPos: (e) => ({ x: e.clientX, y: e.clientY }),
    render: () => {},
    canvas: document.createElement("canvas"),
    editor: { open: () => {}, commit: () => {}, isOpen: () => false },
    mathEditor: { open: () => {}, commit: () => {}, isOpen: () => false },
    editObject: () => {},
    ...over,
  };
}

/** A pointer event carrying only the fields controllers read. */
export function pointer(
  x: number,
  y: number,
  over: {
    pointerId?: number;
    shiftKey?: boolean;
    altKey?: boolean;
    type?: string;
  } = {},
): PointerEvent {
  return {
    pointerId: over.pointerId ?? 1,
    clientX: x,
    clientY: y,
    shiftKey: over.shiftKey ?? false,
    altKey: over.altKey ?? false,
    type: over.type ?? "pointerdown",
    preventDefault: () => {},
  } as unknown as PointerEvent;
}

/** A keydown event carrying only the fields handleShortcut reads. `target`
 *  lets a test simulate typing inside a form field (inField suppression). */
export function keydown(
  key: string,
  mods: {
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
    /** Physical-key code for layout-safe shortcuts (e.g. "BracketRight"). */
    code?: string;
    target?: EventTarget | null;
  } = {},
): KeyboardEvent {
  return {
    key,
    code: mods.code ?? "",
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    target: mods.target ?? null,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
}
