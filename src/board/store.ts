// The single Zustand store. It holds BOTH halves of the model but keeps them
// conceptually separate:
//
//   DOCUMENT state  -> board: BoardDocument   (a read-only MIRROR of the live
//                                               Yjs document owned by
//                                               src/collab/session.ts; mutated
//                                               only via the named document
//                                               actions below, which write to
//                                               the CRDT - the mirror flows
//                                               back through onBoardChange)
//   EPHEMERAL state -> camera, tool, color, pen/text/math/eraser sizes, selection
//                                               (local-only; never persisted to
//                                               the document, never synced)
//
// RULE: never mutate board.objects / board.strokes / board.background outside an
// action. UI and tools call addObject / updateObject / addStroke / etc. Those
// actions are the sync seam: each becomes one Yjs transaction, which both
// applies locally (synchronously, via the session's observer -> onBoardChange)
// and syncs to collaborators when a shared session is connected.
//
// UNDO/REDO is the session's Y.UndoManager scoped to THIS user's transactions:
// undo reverts your own edits only, never a collaborator's. pushHistory() marks
// step boundaries (drag handlers call it once at drag start, exactly as before).

import { create } from "zustand";
import type {
  AnyBoardObject,
  Background,
  BoardDocument,
  BoardSummary,
  Camera,
  Stroke,
  ToolName,
} from "@/board/types";
import { id as newId, newBoardDocument } from "@/board/types";
import { applyEraser } from "@/board/geometry";
import { defaultSizes } from "@/ui/constants";
import type { SizeChannelId } from "@/ui/constants";
import type { ShapeKind } from "@/tools/shape/geometry";
import { migrateDocument } from "@/board/migrations";
import { localRepository } from "@/board/persistence/LocalBoardRepository";
import { theme } from "@/styles/theme";
import * as session from "@/collab/session";
import { LOCAL_ORIGIN, SEED_ORIGIN } from "@/collab/docModel";
import { useCollabStore } from "@/collab/collabStore";
import { getStoredName } from "@/collab/profile";
import { track, trackBoardActivated } from "@/analytics";
import { IS_LANGUAGE, SUBJECT, crossAppRedirect } from "@/subject";
import { adoptBoardContent, setBoardPacks, importedPacks } from "@/lang/content/registry";
import { packsUsedBy, dedupePacks } from "@/lang/content/embed";
import type { ContentPack } from "@/lang/content/schema";
import { useLangStore } from "@/lang/store";
import { defaultPair, isValidPair } from "@/lang/pairs";

/**
 * The current selection. Holds object ids AND stroke ids so freehand "arcs" can
 * be selected, moved and deleted alongside placed objects. Ephemeral: the empty
 * selection is `{ objectIds: [], strokeIds: [] }`.
 */
export interface Selection {
  objectIds: string[];
  strokeIds: string[];
}

const EMPTY_SELECTION: Selection = { objectIds: [], strokeIds: [] };

/**
 * The draw tool's active mode: freehand ink, one of the shape kinds (roadmap
 * A2), or "freepoly" — the point-by-point polygon (click to add corners,
 * close back onto the first one; the committed object is a `polygon` shape).
 * One dock button, toggled in the options pill / by shortcut — the pen tool
 * "became the drawing tool".
 */
export type DrawMode = "free" | "highlighter" | "freepoly" | ShapeKind;

/**
 * THE draw-mode table, in UI order. One list drives everything mode-shaped:
 * the options pill's mode row (label + tooltip; icons live UI-side in
 * ui/toolSpecs), the `mode-<x>` shortcut entries (key + help label,
 * generated in ui/shortcuts.ts) and the cycle the draw key (3 / D) steps
 * through. Adding a draw mode = one row here (+ its icon and geometry).
 */
export interface DrawModeSpec {
  mode: DrawMode;
  /** Pill tooltip / aria-label. */
  label: string;
  /** Bare shortcut key (lowercase), or null for none (curve: B is taken by
   *  the background-colour cycle; it stays reachable from the pill). */
  key: string | null;
  /** Help-page description (defaults to `label`). */
  hint?: string;
}

export const DRAW_MODES: DrawModeSpec[] = [
  { mode: "free", label: "Freehand", key: "f", hint: "Freehand pen" },
  {
    mode: "highlighter",
    label: "Highlighter",
    key: "k",
    hint: "Highlighter (translucent marker)",
  },
  { mode: "line", label: "Line", key: "l", hint: "Line (clicks onto 15° directions)" },
  { mode: "arrow", label: "Arrow", key: "a", hint: "Arrow (clicks onto 15° directions)" },
  { mode: "rect", label: "Rectangle", key: "r", hint: "Rectangle (square via the lock toggle)" },
  { mode: "ellipse", label: "Ellipse", key: "o", hint: "Ellipse (circle via the lock toggle)" },
  { mode: "triangle", label: "Triangle", key: "y", hint: "Triangle (drag corners to change its angles)" },
  { mode: "polygon", label: "Polygon", key: "n", hint: "Polygon (n-gon — sides in the options pill)" },
  {
    mode: "freepoly",
    label: "Point-by-point polygon",
    key: "q",
    hint: "Point-by-point polygon (click corners; close on the first one)",
  },
  { mode: "curve", label: "Curve", key: null },
  { mode: "angle", label: "Angle", key: "g", hint: "Angle (drag to open it, like a protractor)" },
];

/** The cycle order (derived — never a second hand-kept list). */
export const DRAW_MODE_ORDER: DrawMode[] = DRAW_MODES.map((m) => m.mode);

/**
 * How a shared board was joined, for the `board_joined` analytics event:
 *   link    - opened a ?board=<code> share link (URL)
 *   code    - typed a code / pasted a link into the Join form
 *   library - re-opened a remembered shared board from the boards manager
 */
export type JoinSource = "link" | "code" | "library";

export const selectionCount = (s: Selection): number =>
  s.objectIds.length + s.strokeIds.length;


interface BoardState {
  // ---- DOCUMENT state (mirror of the live Yjs doc) ----
  board: BoardDocument;

  // ---- DRAFT / LIBRARY linkage (local-only) ----
  /**
   * Id of the named library board this working draft was opened from / last
   * saved to. null for a board that has never been explicitly saved. Ctrl+S
   * ("save over the same") writes the draft back to this id.
   */
  sourceId: string | null;
  /** The draft has unsaved changes relative to its linked library board. */
  dirty: boolean;

  // ---- EPHEMERAL state (local-only) ----
  camera: Camera;
  tool: ToolName;
  color: string;
  /**
   * Per-channel size defaults (screen px; text/maths in font px). One table,
   * seeded from ui/constants SIZE_CHANNELS — which channel the active tool
   * binds to is board/styling.ts's sizeBinding. New sized tools add a channel
   * there, not a field + setter here.
   */
  sizes: Record<SizeChannelId, number>;
  /** Default horizontal alignment for new text (and the live edit target). */
  textAlign: "left" | "center" | "right";
  /** The draw tool's mode: freehand ink or a shape kind (roadmap A2). */
  drawMode: DrawMode;
  /**
   * The draw tool was entered to EDIT an existing object (double-clicking a
   * shape / stroke in the pointer tool switches here — see select.ts
   * editObjectAt). While set, a double-click anywhere returns to the pointer
   * ("double-click to enter, double-click to exit"), and stray stationary taps
   * don't drop dots. Cleared by any tool switch. Ephemeral.
   */
  drawEditMode: boolean;
  /** Background colour for new closed shapes ("none" = transparent). */
  fillColor: string;
  /** Side count for new regular polygons (3-12). */
  polygonSides: number;
  /** Lock the drag box square while drawing rect/ellipse — the SQUARE and
   *  CIRCLE modes (touch devices have no Shift key to hold). */
  aspectLock: boolean;
  /** Grid snapping (roadmap A3): honoured only on squared paper; Alt bypasses. */
  snap: boolean;
  /**
   * Laser pointer: a TOGGLE on the pointer (Select) tool, not a tool of its
   * own. While on, the select controller's gestures become the laser (point /
   * bring-others / frame-an-area) — see canvas/interactions/laser.ts. Ephemeral.
   */
  laserMode: boolean;
  /**
   * Laser "frame an area" armed: the next laser drag frames a box that zooms
   * everyone to it, instead of pointing. The touch-friendly equivalent of
   * holding Shift; auto-disarms once an area is framed. Only meaningful while
   * laserMode is on (cleared when the laser turns off).
   */
  laserFrame: boolean;
  /** The local user's laser colour (hex). Broadcast with the trail so peers see
   *  it (see canvas/interactions/laser.ts). Default red = LASER_PALETTE[0]. */
  laserColor: string;
  /** Object + stroke ids currently selected (multi-select). */
  selection: Selection;
  /**
   * Id of the text object currently being edited via the textarea overlay.
   * The canvas hides this object from its own draw pass while editing (the
   * text tool's draw() also no-ops for it). Ephemeral: never persisted.
   */
  editingId: string | null;

  // ---- HISTORY (Y.UndoManager state, local edits only) ----
  canUndo: boolean;
  canRedo: boolean;

  // ---- DOCUMENT actions (the sync seam) ----
  addObject(obj: AnyBoardObject): void;
  /**
   * Add several objects + strokes at once as a SINGLE undoable step (duplicate
   * / paste). They land on top, keeping the given array order as their relative
   * z-order. No-op when both lists are empty.
   */
  addShapes(objects: AnyBoardObject[], strokes: Stroke[]): void;
  /** Patch an object's fields. Pushes a history entry. */
  updateObject(id: string, patch: Partial<AnyBoardObject>): void;
  /** Patch a freehand stroke's live style (colour, width). Pushes a history
   *  entry, like updateObject — the options pill edits a stroke this way. */
  updateStroke(id: string, patch: Partial<Stroke>): void;
  /**
   * Patch LIVE WIDGET STATE on an object (typed quiz answers, marks). Syncs to
   * peers and persists in the document like updateObject, but never enters the
   * undo history and never starts a new undo step. `undefined` values delete
   * their field.
   */
  updateWidgetState(id: string, patch: Record<string, unknown>): void;
  /**
   * Toggle a tool's worked answer on/off (the systemic reveal button). Flips the
   * object's `revealed` flag as LIVE WIDGET STATE (INPUT_ORIGIN): it syncs to
   * peers and persists, but never enters the undo history. No-op if the object
   * is gone. Only meaningful for tools registered with `answer: true`.
   */
  toggleAnswer(id: string): void;
  /**
   * Move an object. Does NOT push history -- the drag handler pushes once at
   * drag start so the whole drag is a single undo step.
   */
  moveObject(id: string, x: number, y: number): void;
  /**
   * Resize an object to a new box (x/y/w/h). Does NOT push history -- the resize
   * handler pushes once at drag start so the whole resize collapses to a single
   * undo step (mirrors moveObject).
   */
  resizeObject(
    id: string,
    rect: { x: number; y: number; w: number; h: number },
  ): void;
  /**
   * Patch an object mid-drag (vertex-handle edits). Does NOT push history --
   * the drag handler pushes once at drag start so the whole drag is a single
   * undo step (mirrors moveObject / resizeObject).
   */
  dragObject(id: string, patch: Partial<AnyBoardObject>): void;
  /**
   * Rewrite z-order keys on the given shapes as one undoable step (bring to
   * front / send to back — computed in board/commands.ts).
   */
  setShapeOrders(
    objectOrders: Record<string, number>,
    strokeOrders: Record<string, number>,
  ): void;
  /** Tag (or untag, groupId null) shapes as one group, one undoable step. */
  setGroup(
    objectIds: string[],
    strokeIds: string[],
    groupId: string | null,
  ): void;
  /**
   * Translate every selected object and stroke by (dx, dy) in world coords.
   * Does NOT push history -- the drag handler pushes once at drag start so the
   * whole drag collapses to a single undo step (mirrors moveObject).
   */
  nudgeSelection(dx: number, dy: number): void;
  removeObject(id: string): void;
  /** Remove every selected object and stroke in one undoable step; clears the selection. */
  deleteSelection(): void;
  addStroke(stroke: Stroke): void;
  /**
   * Apply an eraser pass geometrically: trim the covered points out of every
   * pen stroke, splitting them into surviving fragments and deleting any stroke
   * fully erased. The eraser itself is NOT stored -- so erased gaps travel with
   * the stroke when it is moved. One undo step; no-op if nothing is touched.
   */
  eraseStrokes(eraser: { points: { x: number; y: number }[]; size: number }): void;
  setBackground(bg: Background): void;

  // ---- HISTORY actions ----
  /** Mark an undo-step boundary: the next local edit starts a fresh step. */
  pushHistory(): void;
  undo(): void;
  redo(): void;

  // ---- EPHEMERAL actions ----
  setTool(t: ToolName): void;
  /** Set (or clear) the draw tool's edit-a-target mode. */
  setDrawEditMode(on: boolean): void;
  setColor(c: string): void;
  /** Set one size channel's default (see `sizes`). */
  setSize(channel: SizeChannelId, n: number): void;
  setTextAlign(a: "left" | "center" | "right"): void;
  setDrawMode(m: DrawMode): void;
  setFillColor(c: string): void;
  setPolygonSides(n: number): void;
  setAspectLock(on: boolean): void;
  setSnap(on: boolean): void;
  setLaserMode(on: boolean): void;
  /** Flip the laser toggle (bound to a second press of the pointer key). */
  toggleLaserMode(): void;
  /** Arm/disarm "frame an area" (the Shift-less way to frame on touch). */
  setLaserFrame(on: boolean): void;
  toggleLaserFrame(): void;
  setLaserColor(hex: string): void;
  setCamera(patch: Partial<Camera>): void;
  /** Select exactly one object (or clear the selection when id is null). */
  select(id: string | null): void;
  /** Replace the whole selection (objects + strokes). */
  setSelection(sel: Selection): void;
  /** Clear the selection. */
  clearSelection(): void;
  /** Select every object and every (non-eraser) stroke on the board. */
  selectAll(): void;
  setEditingId(id: string | null): void;

  // ---- COLLAB lifecycle ----
  /** Join the shared board `boardId`. `source` (default "link") tags how the
   *  join was initiated for analytics. */
  joinBoard(boardId: string, source?: JoinSource): Promise<void>;
  /**
   * Start sharing the CURRENT board under a fresh id: seeds a shared session
   * with the current content, puts ?board=<id> in the URL and returns the
   * copyable share link.
   */
  shareBoard(): Promise<string>;
  /** Leave the shared session, keeping the current content as the local draft. */
  leaveBoard(): void;

  // ---- LOAD / SAVE lifecycle ----
  /** Load the working draft (or seed one) via localRepository; joins a shared
   *  board instead when the URL carries ?board=<id>. */
  init(): Promise<void>;
  /** Summaries of every named library board (newest first). */
  listBoards(): Promise<BoardSummary[]>;
  /**
   * Save the draft over its linked library board ("save over the same"). If the
   * draft has never been saved (no source), returns { needsName: true } so the
   * caller can prompt for a name and call saveAs instead.
   */
  saveCurrent(): Promise<{ needsName: boolean }>;
  /** Save the draft as a NEW named library board and link the draft to it. */
  saveAs(name: string): Promise<void>;
  /** Rename a library board; keeps the draft's name in sync if it's the source. */
  renameBoard(id: string, name: string): Promise<void>;
  /** Replace the draft with a copy of the named library board. */
  openBoard(id: string): Promise<void>;
  /** Start a fresh, empty, unsaved draft. */
  newBoard(): Promise<void>;
  /** Delete a library board; unlinks the draft if it was the source. */
  deleteBoard(id: string): Promise<void>;
}

// --- Debounced draft autosave -------------------------------------------
// Every document change flushes the WORKING DRAFT (not the named library
// board) here. Shared sessions skip it: Y-Sweet persists the shared board,
// and the private local draft must not be overwritten by someone else's
// content just because you opened their link.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function cancelDraftSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
}
function scheduleDraftSave(): void {
  cancelDraftSave();
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    if (useCollabStore.getState().mode === "shared") return;
    const { board, sourceId, dirty } = useBoardStore.getState();
    void localRepository.saveDraft({ doc: board, sourceId, dirty });
  }, 400);
}
/**
 * Cancel any pending debounced draft save without writing. Lifecycle actions
 * cancel implicitly via flushDraft; this is for hosts that tear the world
 * down between edits (the unit tests' afterEach — a timer firing after jsdom
 * teardown would crash on the missing localStorage).
 */
export function cancelScheduledDraftSave(): void {
  cancelDraftSave();
}

/** Write the draft immediately (used by explicit lifecycle actions). */
async function flushDraft(
  doc: BoardDocument,
  sourceId: string | null,
  dirty: boolean,
): Promise<void> {
  cancelDraftSave();
  await localRepository.saveDraft({ doc, sourceId, dirty });
}

// --- Debounced remote-ref refresh ---------------------------------------
// While a board is SHARED, its content is persisted online by Y-Sweet, not in a
// local draft. We only keep a lightweight pointer (name + last-seen time) so the
// board shows up in "previously visited shared boards". The name tracks the live
// shared name, so a rename by ANY collaborator updates every peer's listing.
let remoteRefTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRemoteRefSave(): void {
  if (remoteRefTimer) clearTimeout(remoteRefTimer);
  remoteRefTimer = setTimeout(() => {
    remoteRefTimer = undefined;
    const { mode, boardId } = useCollabStore.getState();
    if (mode !== "shared" || !boardId) return;
    const { board } = useBoardStore.getState();
    void localRepository.saveRemote({
      id: boardId,
      name: board.name,
      updatedAt: Date.now(),
    });
  }, 400);
}

/** Reset transient per-document state when the document is swapped wholesale. */
const FRESH_DOC_STATE = {
  canUndo: false,
  canRedo: false,
  selection: EMPTY_SELECTION,
  editingId: null as string | null,
};

// "Which single object/stroke is being styled live" used to be four per-type
// selectors here; it is now ONE — board/styling.ts's activeEditTarget, next to
// the style channels that consume it.

/**
 * Whether the current board is a PERSISTED board (so its name should be shown)
 * rather than a never-saved local draft. A shared board always counts — it lives
 * in the online store under a name every collaborator sees; a solo board counts
 * once it has a linked library entry (`sourceId`). Single source of truth for the
 * toolbar title and the boards manager so "what name do we show" lives in one
 * place.
 */
export function isSavedBoard(
  sourceId: string | null,
  shared: boolean,
): boolean {
  return shared || sourceId != null;
}

/** Fallback display name when the user dismissed / never saw the prompt. */
const displayName = (): string => getStoredName() ?? "Guest";

export const useBoardStore = create<BoardState>((set, get) => {
  return {
    board: {
      // Replaced by init(); a synchronous placeholder keeps types honest and
      // lets the UI render before async load resolves.
      id: "pending",
      name: "Untitled board",
      background: "squared",
      objects: [],
      strokes: [],
      createdAt: 0,
      updatedAt: 0,
    },
    sourceId: null,
    dirty: false,

    camera: { x: 0, y: 0, scale: 1 },
    tool: "pen",
    color: theme.ink,
    sizes: defaultSizes(),
    textAlign: "left",
    drawMode: "free",
    drawEditMode: false,
    laserMode: false,
    laserFrame: false,
    laserColor: "#ff2b2b", // LASER_PALETTE[0] (red)
    fillColor: "none",
    polygonSides: 5,
    aspectLock: false,
    snap: true,
    selection: EMPTY_SELECTION,
    editingId: null,

    canUndo: false,
    canRedo: false,

    // ---- DOCUMENT actions (each one = one CRDT transaction) ----
    addObject(obj) {
      session.stopCapture();
      session.insertObject(obj);
    },

    addShapes(objects, strokes) {
      if (objects.length === 0 && strokes.length === 0) return;
      session.stopCapture();
      session.insertShapes(objects, strokes);
    },

    updateObject(id, patch) {
      session.stopCapture();
      session.patchObject(id, patch);
    },

    updateStroke(id, patch) {
      session.stopCapture();
      session.patchStroke(id, patch);
    },

    updateWidgetState(id, patch) {
      // No stopCapture: this must not cut an undo step boundary, and the
      // INPUT_ORIGIN transaction is invisible to the UndoManager anyway.
      session.patchObjectInput(id, patch);
    },

    toggleAnswer(id) {
      const obj = get().board.objects.find((o) => o.id === id);
      if (!obj) return;
      // Reveal is live widget state, exactly like typed quiz answers: shared and
      // persisted, but undo-invisible (INPUT_ORIGIN), and it never resizes the
      // object (paramsOf strips `revealed`, so the box is reveal-independent).
      const revealing = !obj.revealed;
      session.patchObjectInput(id, { revealed: revealing });
      // Only the reveal direction is an "answers revealed" signal, not hiding.
      if (revealing) track("tool_action", { tool: obj.type, action: "revealed" });
    },

    moveObject(id, x, y) {
      // No history boundary here -- caller pushed once at drag start.
      session.patchObject(id, { x, y });
    },

    resizeObject(id, rect) {
      // No history boundary here -- caller pushed once at drag start.
      session.patchObject(id, { ...rect });
    },

    dragObject(id, patch) {
      // No history boundary here -- caller pushed once at drag start.
      session.patchObject(id, patch);
    },

    setShapeOrders(objectOrders, strokeOrders) {
      session.stopCapture();
      session.setShapeOrders(objectOrders, strokeOrders);
    },

    setGroup(objectIds, strokeIds, groupId) {
      session.stopCapture();
      session.setShapeGroup(objectIds, strokeIds, groupId);
    },

    nudgeSelection(dx, dy) {
      // No history boundary here -- caller pushed once at drag start.
      const sel = get().selection;
      if (selectionCount(sel) === 0 || (dx === 0 && dy === 0)) return;
      session.translateShapes(sel.objectIds, sel.strokeIds, dx, dy);
    },

    removeObject(id) {
      const obj = get().board.objects.find((o) => o.id === id);
      session.stopCapture();
      session.removeShapes([id], []);
      // A deliberate widget delete (e.g. the worksheet's own trash button).
      // Skip the text-editor's cleanup of an abandoned EMPTY text box — that was
      // never a committed widget, so counting it as a delete would be noise
      // (and text is created off-placeObject, so it has no matching "created").
      if (obj && !(obj.type === "text" && !obj.text)) {
        track("tool_action", { tool: obj.type, action: "deleted" });
      }
      // Selection pruning happens in onBoardChange (ids no longer on the board).
    },

    deleteSelection() {
      const sel = get().selection;
      if (selectionCount(sel) === 0) return;
      // Resolve the deleted widgets' types BEFORE removal (one event each;
      // strokes aren't tools, so they're excluded from the matrix).
      const { objects } = get().board;
      const deletedTools = sel.objectIds
        .map((oid) => objects.find((o) => o.id === oid)?.type)
        .filter((t): t is string => t != null);
      session.stopCapture();
      session.removeShapes(sel.objectIds, sel.strokeIds);
      set({ selection: EMPTY_SELECTION });
      for (const tool of deletedTools) {
        track("tool_action", { tool, action: "deleted" });
      }
    },

    addStroke(stroke) {
      session.stopCapture();
      session.insertStroke(stroke);
      // First mark on this board = the board is "activated" (fires once/board).
      trackBoardActivated(get().board.id);
    },

    eraseStrokes(eraser) {
      if (eraser.points.length === 0) return;
      const current = get().board.strokes;
      const next = applyEraser(current, eraser.points, eraser.size);
      // applyEraser only rewrites strokes it actually trims, so a different
      // array length OR identity means something changed. Detect a no-op (the
      // eraser passed over blank space) to avoid an empty undo step.
      const changed =
        next.length !== current.length ||
        next.some((s, i) => s !== current[i]);
      if (!changed) return;
      session.stopCapture();
      session.reconcileStrokes(next);
      // Split-away stroke ids are pruned from the selection in onBoardChange.
    },

    setBackground(bg) {
      session.stopCapture();
      session.setBackground(bg);
      track("background_set", { kind: bg });
    },

    // ---- HISTORY ----
    pushHistory() {
      session.stopCapture();
    },
    undo() {
      session.undo();
    },
    redo() {
      session.redo();
    },

    // ---- EPHEMERAL actions ----
    setTool(t) {
      // Any deliberate tool switch ends an edit session: picking the draw tool
      // fresh (dock / shortcut) must not inherit a stale double-click-to-exit.
      // The Move (pan) tool navigates only — it carries no selection, so
      // arriving at it clears any current one (and thus its on-canvas chrome).
      set((s) => ({
        tool: t,
        drawEditMode: false,
        selection: t === "pan" ? EMPTY_SELECTION : s.selection,
      }));
    },
    setDrawEditMode(on) {
      set({ drawEditMode: on });
    },
    setColor(c) {
      set({ color: c });
    },
    setSize(channel, n) {
      set((s) => ({ sizes: { ...s.sizes, [channel]: n } }));
    },
    setTextAlign(a) {
      set({ textAlign: a });
    },
    setDrawMode(m) {
      set({ drawMode: m });
    },
    setFillColor(c) {
      set({ fillColor: c });
    },
    setPolygonSides(n) {
      set({ polygonSides: n });
    },
    setAspectLock(on) {
      set({ aspectLock: on });
    },
    setSnap(on) {
      set({ snap: on });
    },
    setLaserMode(on) {
      // Turning the laser off also disarms area-framing (it's meaningless then).
      set((s) => ({ laserMode: on, laserFrame: on ? s.laserFrame : false }));
    },
    toggleLaserMode() {
      set((s) => {
        const laserMode = !s.laserMode;
        return { laserMode, laserFrame: laserMode && s.laserFrame };
      });
    },
    setLaserFrame(on) {
      set({ laserFrame: on });
    },
    toggleLaserFrame() {
      set((s) => ({ laserFrame: !s.laserFrame }));
    },
    setLaserColor(hex) {
      set({ laserColor: hex });
    },
    setCamera(patch) {
      set((state) => ({ camera: { ...state.camera, ...patch } }));
    },
    select(id) {
      set({
        selection:
          id == null ? EMPTY_SELECTION : { objectIds: [id], strokeIds: [] },
      });
    },
    setSelection(sel) {
      set({ selection: sel });
    },
    clearSelection() {
      set({ selection: EMPTY_SELECTION });
    },
    selectAll() {
      const { board } = get();
      set({
        selection: {
          objectIds: board.objects.map((o) => o.id),
          strokeIds: board.strokes
            .filter((s) => s.mode !== "eraser")
            .map((s) => s.id),
        },
      });
    },
    setEditingId(id) {
      set({ editingId: id });
    },

    // ---- COLLAB lifecycle ----
    async joinBoard(boardId, source = "link") {
      const board = session.joinShared(boardId, displayName());
      session.putBoardIdInUrl(boardId);
      track("board_joined", { via: source });
      // A joined board is remote content: unlink it from the local library and
      // keep the user's own private draft untouched (don't overwrite it with
      // someone else's board). The FRESH state clears undo/selection.
      cancelDraftSave();
      set({
        board,
        sourceId: null,
        dirty: false,
        camera: { x: 0, y: 0, scale: 1 },
        ...FRESH_DOC_STATE,
      });
      // Remember it as a visited shared board. The name may still be the default
      // until the first server sync lands; onBoardChange refreshes it then.
      await localRepository.saveRemote({
        id: boardId,
        name: board.name,
        updatedAt: Date.now(),
      });
    },

    async shareBoard() {
      const current = session.currentBoard();
      const prevSourceId = get().sourceId;
      // Short hex code, not a UUID: it doubles as the join code people can
      // type in by hand (Share dialog -> "Join with a code").
      const boardId = session.newBoardCode();
      const board = session.joinShared(boardId, displayName(), current);
      session.putBoardIdInUrl(boardId);
      // The board now lives in the ONLINE store. Move it there fully: register a
      // remote pointer, drop any LOCAL copy it had (so it isn't in both stores),
      // and discard the now-stale local draft — reopening the app plainly should
      // not resurrect the pre-share solo copy. Unlink the local source.
      cancelDraftSave();
      set({ board, sourceId: null, dirty: false, canUndo: false, canRedo: false });
      await localRepository.saveRemote({
        id: boardId,
        name: current.name,
        updatedAt: Date.now(),
      });
      if (prevSourceId) await localRepository.remove(prevSourceId);
      await localRepository.clearDraft();
      track("board_shared");
      return session.shareLink();
    },

    leaveBoard() {
      // Keep what's on screen as the working draft ("leave with a local copy").
      // It becomes an unlinked (Untitled) draft: the board itself stays in the
      // online store and the remembered remote list, ready to rejoin. Saving
      // this local copy later is a deliberate fork, not an accidental duplicate.
      const current = session.currentBoard();
      const board = session.startSolo(current);
      session.clearBoardIdFromUrl();
      set({ board, sourceId: null, dirty: true, ...FRESH_DOC_STATE });
      void flushDraft(board, null, true);
    },

    // ---- LOAD / SAVE ----
    async init() {
      // A share link takes precedence over the local draft: join that board.
      const sharedId = session.boardIdFromUrl();
      if (sharedId) {
        await get().joinBoard(sharedId, "link");
        return;
      }

      // Resume the working draft exactly if one exists.
      const draft = await localRepository.loadDraft();
      if (draft) {
        const board = session.startSolo(migrateDocument(draft.doc));
        set({
          board,
          sourceId: draft.sourceId,
          dirty: draft.dirty,
          ...FRESH_DOC_STATE,
        });
        return;
      }

      // No draft yet (first run / upgrade from the old single-board format):
      // seed the draft from the most-recent library board if there is one, else
      // start blank. Nothing is written to the library here -- only the draft.
      const summaries = await localRepository.list();
      let doc: BoardDocument | undefined;
      let sourceId: string | null = null;
      if (summaries.length > 0) {
        const src = await localRepository.load(summaries[0].id);
        if (src) {
          doc = migrateDocument(src);
          sourceId = src.id;
        }
      }
      if (!doc) doc = newBoardDocument();
      await flushDraft(doc, sourceId, false);
      const board = session.startSolo(doc);
      set({ board, sourceId, dirty: false, ...FRESH_DOC_STATE });
    },

    async listBoards() {
      // The library is the union of LOCAL boards and remembered REMOTE (shared)
      // boards, newest first. A board is only ever in one of the two — sharing
      // moves it online (see shareBoard) — so there are no duplicates to merge.
      const [local, remotes] = await Promise.all([
        localRepository.list(),
        localRepository.listRemotes(),
      ]);
      const remoteSummaries: BoardSummary[] = remotes.map((r) => ({
        ...r,
        remote: true,
      }));
      return [...local, ...remoteSummaries].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
    },

    async saveCurrent() {
      const collab = useCollabStore.getState();
      if (collab.mode === "shared" && collab.boardId) {
        // A shared board is persisted online continuously; "Save" just refreshes
        // the remembered pointer (name + time). No local copy is ever written,
        // so the board is never duplicated across the online and local stores.
        await localRepository.saveRemote({
          id: collab.boardId,
          name: session.currentBoard().name,
          updatedAt: Date.now(),
        });
        set({ dirty: false });
        return { needsName: false };
      }
      const { sourceId } = get();
      if (sourceId == null) return { needsName: true };
      const doc: BoardDocument = {
        ...session.currentBoard(),
        id: sourceId,
        updatedAt: Date.now(),
      };
      await localRepository.save(doc);
      await flushDraft(doc, sourceId, false);
      set({ dirty: false });
      track("board_saved", { as: "same" });
      return { needsName: false };
    },

    async saveAs(name) {
      const collab = useCollabStore.getState();
      if (collab.mode === "shared" && collab.boardId) {
        // Naming a SHARED board renames the online doc for EVERY collaborator
        // (setBoardName syncs it) and refreshes the remembered pointer. It writes
        // NO local copy — the board stays online-only, no local/online duplicate.
        session.setBoardName(name);
        await localRepository.saveRemote({
          id: collab.boardId,
          name,
          updatedAt: Date.now(),
        });
        set({ dirty: false });
        return;
      }
      const now = Date.now();
      const docId = newId();
      const doc: BoardDocument = {
        ...session.currentBoard(),
        id: docId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      await localRepository.save(doc);
      // Rename the live document too (syncs to peers; not undoable).
      session.setBoardName(name);
      await flushDraft(doc, docId, false);
      set({ sourceId: docId, dirty: false });
      track("board_saved", { as: "new" });
    },

    async renameBoard(boardId, name) {
      // Remote (shared) board: rename its online doc so every collaborator's
      // title updates (when we're the one connected to it), and refresh the
      // remembered pointer. No local document is involved.
      const remotes = await localRepository.listRemotes();
      const remote = remotes.find((r) => r.id === boardId);
      if (remote) {
        await localRepository.saveRemote({ ...remote, name, updatedAt: Date.now() });
        if (useCollabStore.getState().boardId === boardId) {
          session.setBoardName(name);
        }
        return;
      }
      await localRepository.rename(boardId, name);
      if (get().sourceId === boardId) {
        session.setBoardName(name); // mirror + peers pick the name up
        if (useCollabStore.getState().mode === "solo") {
          await flushDraft(
            { ...session.currentBoard(), name },
            boardId,
            get().dirty,
          );
        }
      }
    },

    async openBoard(boardId) {
      const src = await localRepository.load(boardId);
      if (!src) return;
      const doc = migrateDocument(src);
      // Opening a library board always lands in a private solo session.
      const board = session.startSolo(doc);
      session.clearBoardIdFromUrl();
      await flushDraft(doc, boardId, false);
      set({
        board,
        sourceId: boardId,
        dirty: false,
        camera: { x: 0, y: 0, scale: 1 },
        ...FRESH_DOC_STATE,
      });
    },

    async newBoard() {
      const doc = newBoardDocument();
      const board = session.startSolo(doc);
      session.clearBoardIdFromUrl();
      await flushDraft(doc, null, false);
      set({
        board,
        sourceId: null,
        dirty: false,
        camera: { x: 0, y: 0, scale: 1 },
        ...FRESH_DOC_STATE,
      });
      track("board_created");
    },

    async deleteBoard(boardId) {
      // Remote (shared) board: "Delete" just forgets it from THIS user's list —
      // the online board itself stays for anyone else with the code. If we're
      // currently connected to it, leave first (keeping a local copy on screen).
      const remotes = await localRepository.listRemotes();
      if (remotes.some((r) => r.id === boardId)) {
        if (useCollabStore.getState().boardId === boardId) get().leaveBoard();
        await localRepository.removeRemote(boardId);
        return;
      }
      await localRepository.remove(boardId);
      if (get().sourceId === boardId) {
        // The open board's library entry is gone; keep the work but unlink it so
        // it reads as an unsaved draft again.
        if (useCollabStore.getState().mode === "solo") {
          await flushDraft(session.currentBoard(), null, true);
        }
        set({ sourceId: null, dirty: true });
      }
    },
  };
});

// --- custom-content <-> board wiring (language board) -----------------------
// Two directions, both funnelled through onBoardChange so every path (load,
// open, join, remote sync, local edit) is covered by one place:
//   • ADOPT — when a board ARRIVES (open, join, first shared sync), its packs
//     become the active teaching content and the language pair follows, so the
//     board is fully usable with no trip to the contents page.
//   • REGISTER — on subsequent changes, keep the packs a board carries
//     available so its widgets resolve, even for someone who never imported
//     them (without re-fighting deliberate mid-session choices).
//   • EMBED — on the author's own edits, keep the board's embedded set equal to
//     the imported packs its widgets now use, so Save/Share carry the content.
const samePackIds = (
  a: NonNullable<BoardDocument["contentPacks"]>,
  b: NonNullable<BoardDocument["contentPacks"]>,
): boolean => {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((p) => p.id));
  return b.every((p) => ids.has(p.id));
};

/**
 * Point the language-pair store at the direction an arriving board teaches, so
 * new widgets and the direction control match the board instead of a stale
 * per-device choice. The board's own widgets say it best; an empty board falls
 * back to its first pack's languages (keeping the current known side where the
 * pack offers it). Runs AFTER adoptBoardContent so the pack's languages are in
 * the catalogue when setPair validates.
 */
function adoptBoardPair(board: BoardDocument, packs: ContentPack[]): void {
  const store = useLangStore.getState();
  for (const o of board.objects as readonly Record<string, unknown>[]) {
    if (typeof o.type !== "string" || !o.type.startsWith("lang")) continue;
    const { known, learning } = o;
    if (typeof known === "string" && typeof learning === "string" && known !== learning) {
      store.setPair({ known, learning });
      return;
    }
  }
  const codes = packs[0]?.languages?.map((l) => l.code) ?? [];
  if (codes.length < 2) return;
  const known = codes.includes(store.pair.known) ? store.pair.known : codes[0];
  const learning = codes.find((c) => c !== known);
  if (learning) store.setPair({ known, learning });
}

// The last board + embedded-pack set whose content was ADOPTED (activated as
// the teaching content), so adoption runs once per arrival — on the next
// change event it decays to plain registration and never fights a deliberate
// mid-session choice.
let adoptedContentKey: string | null = null;

function syncBoardContent(board: BoardDocument, origin: unknown): void {
  if (!IS_LANGUAGE) return;
  const packs = Array.isArray(board.contentPacks) ? board.contentPacks : [];
  const key = `${board.id}|${packs.map((p) => p.id).sort().join(",")}`;
  if (key !== adoptedContentKey) {
    const sameBoard = adoptedContentKey?.startsWith(`${board.id}|`) ?? false;
    adoptedContentKey = key;
    // ADOPT: the board's content becomes the active teaching content (open,
    // join, first shared sync, or a collaborator adding content live). Base is
    // only restored when ARRIVING at a pack-less board whose language widgets
    // prove it teaches base-only content — an author deleting their last custom
    // widget, or a board of plain drawings, keeps the current selection.
    const baseOnly =
      packs.length === 0 &&
      board.objects.some((o) => typeof o.type === "string" && o.type.startsWith("lang"));
    adoptBoardContent(packs, !sameBoard && baseOnly);
    if (packs.length > 0) adoptBoardPair(board, packs);
    // A pack-less board teaches from base: a foreign pair can't survive there.
    else if (!isValidPair(useLangStore.getState().pair))
      useLangStore.getState().setPair(defaultPair());
  } else {
    // REGISTER: whatever the board carries (a no-op when unchanged).
    setBoardPacks(packs);
  }
  // EMBED: only react to THIS user's edits — remote/seed writes are already
  // authored elsewhere, and reacting to them would have every peer race to
  // rewrite the same value.
  if (origin !== LOCAL_ORIGIN) return;
  const available = dedupePacks([...importedPacks(), ...(board.contentPacks ?? [])]);
  const used = packsUsedBy(board.objects, available);
  const current = board.contentPacks ?? [];
  if (samePackIds(used, current)) return;
  // Defer the write: mutating the doc from inside its own change callback is
  // avoided, and the resulting SEED-origin change comes back here as a no-op.
  queueMicrotask(() => {
    try {
      session.setContentPacks(used.length > 0 ? used : undefined);
    } catch {
      /* the board was swapped out before the microtask ran — nothing to embed */
    }
  });
}

// --- Yjs session -> store wiring --------------------------------------------
// Every committed transaction (local edit, remote edit, undo/redo, seed) lands
// here with the fresh mirror. Keep the selection valid (drop ids whose shape no
// longer exists - remote deletes, undo, eraser splits) and autosave the draft.

// Set once we've started navigating to the other app flavour (cross-app
// hand-off below), so the burst of change events during teardown fires the
// navigation only once.
let handingOff = false;

session.registerSessionCallbacks({
  onBoardChange(rawBoard, origin) {
    // Safety net for shapes that reach the store from any source — most
    // importantly a REMOTE shared doc, whose first sync fires here with legacy
    // content BEFORE session's post-sync migrateHandles can rewrite it. On a
    // current document migrateDocument returns the SAME reference, so this is a
    // cheap no-op that preserves the mirror's referential stability.
    const board = migrateDocument(rawBoard);

    // CROSS-APP HAND-OFF. A shared board carries its subject in meta; the first
    // server sync brings it here. If it belongs to the OTHER flavour — a board
    // opened via a hand-typed Join code, or a link that lost its /language/
    // segment — bounce to the correct app (the ?board=<code> query rides along)
    // rather than render it here with the wrong tools and content. Only shared
    // boards route: a solo board is always this app's own. Legacy shared boards
    // carry no subject and are left where they are (see crossAppRedirect).
    if (!handingOff && useCollabStore.getState().mode === "shared") {
      const target = crossAppRedirect(board.subject, window.location.href, SUBJECT);
      if (target) {
        handingOff = true;
        // Forget the pointer this (wrong) app just remembered for the board, so
        // it doesn't linger in this flavour's list — the correct app re-remembers
        // it under the right subject once it joins.
        const { boardId } = useCollabStore.getState();
        if (boardId) void localRepository.removeRemote(boardId);
        window.location.replace(target);
        return;
      }
    }

    syncBoardContent(board, origin);
    const state = useBoardStore.getState();
    const objIds = new Set(board.objects.map((o) => o.id));
    const strokeIds = new Set(board.strokes.map((s) => s.id));
    const keptObjs = state.selection.objectIds.filter((id) => objIds.has(id));
    const keptStrokes = state.selection.strokeIds.filter((id) =>
      strokeIds.has(id),
    );
    const selection =
      keptObjs.length === state.selection.objectIds.length &&
      keptStrokes.length === state.selection.strokeIds.length
        ? state.selection
        : { objectIds: keptObjs, strokeIds: keptStrokes };
    const shared = useCollabStore.getState().mode === "shared";
    useBoardStore.setState({
      board,
      selection,
      // A shared board is saved online continuously, so it's never "dirty";
      // seeding just reloads existing content, so that never dirties either.
      ...(shared || origin === SEED_ORIGIN ? {} : { dirty: true }),
    });
    // Shared: keep the remembered remote pointer's name/time in sync (so a
    // rename by any collaborator updates every peer's boards list). Solo:
    // autosave the working draft.
    if (shared) scheduleRemoteRefSave();
    else scheduleDraftSave();
  },
  onUndoState(canUndo, canRedo) {
    useBoardStore.setState({ canUndo, canRedo });
  },
});
