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
//   EPHEMERAL state -> camera, tool, color, penSize, textSize, selection
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
import { eraseStrokeRuns, rectsIntersect, strokeBounds } from "@/board/geometry";
import { localRepository } from "@/board/persistence/LocalBoardRepository";
import { theme } from "@/styles/theme";
import * as session from "@/collab/session";
import { SEED_ORIGIN } from "@/collab/docModel";
import { useCollabStore } from "@/collab/collabStore";
import { getStoredName } from "@/collab/profile";

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

export const selectionCount = (s: Selection): number =>
  s.objectIds.length + s.strokeIds.length;

/**
 * Apply one eraser path geometrically to a list of pen strokes: trim covered
 * points, splitting each stroke into its surviving fragments and dropping any
 * stroke that is fully erased. The first fragment keeps the original id so a
 * partially-erased selected stroke stays selected. Fragments inherit the
 * parent's fields (including its z-`order`) via the spread.
 */
function applyEraser(
  pens: Stroke[],
  eraserPoints: { x: number; y: number }[],
  eraserSize: number,
): Stroke[] {
  const eraserRadius = eraserSize / 2;
  const eb = strokeBounds({ points: eraserPoints, size: eraserSize });
  const out: Stroke[] = [];
  for (const pen of pens) {
    if (!rectsIntersect(strokeBounds(pen), eb)) {
      out.push(pen);
      continue;
    }
    const runs = eraseStrokeRuns(pen.points, eraserPoints, eraserRadius);
    if (runs === null) {
      out.push(pen); // untouched
      continue;
    }
    runs.forEach((run, idx) =>
      out.push({ ...pen, id: idx === 0 ? pen.id : newId(), points: run }),
    );
  }
  return out;
}

/**
 * Migrate a stroke list to the geometric-eraser model: fold every stored
 * "eraser" overlay stroke into the pen strokes that precede it (the eraser only
 * carved pixels drawn before it), leaving a list of pen strokes only. Idempotent
 * once no eraser strokes remain.
 */
export function bakeErasers(strokes: Stroke[]): Stroke[] {
  if (!strokes.some((s) => s.mode === "eraser")) return strokes;
  let pens: Stroke[] = [];
  for (const s of strokes) {
    if (s.mode === "eraser") pens = applyEraser(pens, s.points, s.size);
    else pens.push(s);
  }
  return pens;
}

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
  penSize: number;
  textSize: number;
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
  /** Patch an object's fields. Pushes a history entry. */
  updateObject(id: string, patch: Partial<AnyBoardObject>): void;
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
  setColor(c: string): void;
  setPenSize(n: number): void;
  setTextSize(n: number): void;
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
  /** Join the shared board `boardId` (from a share link). */
  joinBoard(boardId: string): Promise<void>;
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
/** Write the draft immediately (used by explicit lifecycle actions). */
async function flushDraft(
  doc: BoardDocument,
  sourceId: string | null,
  dirty: boolean,
): Promise<void> {
  cancelDraftSave();
  await localRepository.saveDraft({ doc, sourceId, dirty });
}

/** Reset transient per-document state when the document is swapped wholesale. */
const FRESH_DOC_STATE = {
  canUndo: false,
  canRedo: false,
  selection: EMPTY_SELECTION,
  editingId: null as string | null,
};

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
    penSize: 6,
    textSize: 26,
    selection: EMPTY_SELECTION,
    editingId: null,

    canUndo: false,
    canRedo: false,

    // ---- DOCUMENT actions (each one = one CRDT transaction) ----
    addObject(obj) {
      session.stopCapture();
      session.insertObject(obj);
    },

    updateObject(id, patch) {
      session.stopCapture();
      session.patchObject(id, patch);
    },

    moveObject(id, x, y) {
      // No history boundary here -- caller pushed once at drag start.
      session.patchObject(id, { x, y });
    },

    resizeObject(id, rect) {
      // No history boundary here -- caller pushed once at drag start.
      session.patchObject(id, { ...rect });
    },

    nudgeSelection(dx, dy) {
      // No history boundary here -- caller pushed once at drag start.
      const sel = get().selection;
      if (selectionCount(sel) === 0 || (dx === 0 && dy === 0)) return;
      session.translateShapes(sel.objectIds, sel.strokeIds, dx, dy);
    },

    removeObject(id) {
      session.stopCapture();
      session.removeShapes([id], []);
      // Selection pruning happens in onBoardChange (ids no longer on the board).
    },

    deleteSelection() {
      const sel = get().selection;
      if (selectionCount(sel) === 0) return;
      session.stopCapture();
      session.removeShapes(sel.objectIds, sel.strokeIds);
      set({ selection: EMPTY_SELECTION });
    },

    addStroke(stroke) {
      session.stopCapture();
      session.insertStroke(stroke);
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
      set({ tool: t });
    },
    setColor(c) {
      set({ color: c });
    },
    setPenSize(n) {
      set({ penSize: n });
    },
    setTextSize(n) {
      set({ textSize: n });
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
    async joinBoard(boardId) {
      const board = session.joinShared(boardId, displayName());
      session.putBoardIdInUrl(boardId);
      set({
        board,
        // A joined board is remote content: unlink it from the local library.
        sourceId: null,
        dirty: false,
        camera: { x: 0, y: 0, scale: 1 },
        ...FRESH_DOC_STATE,
      });
    },

    async shareBoard() {
      const current = session.currentBoard();
      const boardId = newId();
      const board = session.joinShared(boardId, displayName(), current);
      session.putBoardIdInUrl(boardId);
      // Same content, same ids: keep selection/camera/source link; only the
      // undo history resets (fresh doc), which FRESH state below would also
      // clear -- do it narrowly to avoid dropping the user's selection.
      set({ board, canUndo: false, canRedo: false });
      return session.shareLink();
    },

    leaveBoard() {
      // Keep what's on screen as the working draft ("leave with a local copy").
      const current = session.currentBoard();
      const board = session.startSolo(current);
      session.clearBoardIdFromUrl();
      set({ board, dirty: true, ...FRESH_DOC_STATE });
      void flushDraft(board, get().sourceId, true);
    },

    // ---- LOAD / SAVE ----
    async init() {
      // A share link takes precedence over the local draft: join that board.
      const sharedId = session.boardIdFromUrl();
      if (sharedId) {
        await get().joinBoard(sharedId);
        return;
      }

      // Migrate any legacy "eraser" overlay strokes into geometry so erased
      // gaps move with their stroke (and fully-erased strokes vanish).
      const bake = (doc: BoardDocument): BoardDocument => {
        const strokes = bakeErasers(doc.strokes);
        return strokes === doc.strokes ? doc : { ...doc, strokes };
      };

      // Resume the working draft exactly if one exists.
      const draft = await localRepository.loadDraft();
      if (draft) {
        const board = session.startSolo(bake(draft.doc));
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
          doc = bake(src);
          sourceId = src.id;
        }
      }
      if (!doc) doc = newBoardDocument();
      await flushDraft(doc, sourceId, false);
      const board = session.startSolo(doc);
      set({ board, sourceId, dirty: false, ...FRESH_DOC_STATE });
    },

    listBoards() {
      return localRepository.list();
    },

    async saveCurrent() {
      const { sourceId } = get();
      if (sourceId == null) return { needsName: true };
      const doc: BoardDocument = {
        ...session.currentBoard(),
        id: sourceId,
        updatedAt: Date.now(),
      };
      await localRepository.save(doc);
      if (useCollabStore.getState().mode === "solo") {
        await flushDraft(doc, sourceId, false);
      }
      set({ dirty: false });
      return { needsName: false };
    },

    async saveAs(name) {
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
      if (useCollabStore.getState().mode === "solo") {
        await flushDraft(doc, docId, false);
      }
      set({ sourceId: docId, dirty: false });
    },

    async renameBoard(boardId, name) {
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
      const strokes = bakeErasers(src.strokes);
      const doc = strokes === src.strokes ? src : { ...src, strokes };
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
    },

    async deleteBoard(boardId) {
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

// --- Yjs session -> store wiring --------------------------------------------
// Every committed transaction (local edit, remote edit, undo/redo, seed) lands
// here with the fresh mirror. Keep the selection valid (drop ids whose shape no
// longer exists - remote deletes, undo, eraser splits) and autosave the draft.
session.registerSessionCallbacks({
  onBoardChange(board, origin) {
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
    useBoardStore.setState({
      board,
      selection,
      // Seeding just reloads existing content; it never dirties the draft.
      ...(origin === SEED_ORIGIN ? {} : { dirty: true }),
    });
    scheduleDraftSave();
  },
  onUndoState(canUndo, canRedo) {
    useBoardStore.setState({ canUndo, canRedo });
  },
});
