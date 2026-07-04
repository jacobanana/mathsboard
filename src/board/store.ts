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
import { migrateDocument } from "@/board/migrations";
import { localRepository } from "@/board/persistence/LocalBoardRepository";
import { theme } from "@/styles/theme";
import * as session from "@/collab/session";
import { SEED_ORIGIN } from "@/collab/docModel";
import { useCollabStore } from "@/collab/collabStore";
import { getStoredName } from "@/collab/profile";
import { track, trackBoardActivated } from "@/analytics";

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
  penSize: number;
  textSize: number;
  /** Base font size new maths notation is placed at (maps onto the uniform
   *  resize scale: 26 = the layout size, i.e. scale 1 — see tools/mathtext). */
  mathSize: number;
  /** Eraser footprint diameter (screen px, like penSize). */
  eraserSize: number;
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
  setMathSize(n: number): void;
  setEraserSize(n: number): void;
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

/**
 * The lone object of `type` currently being styled, or null. Editing (an
 * in-place overlay) wins over selection; for selection only a single selected
 * object qualifies (never a multi-select or a stroke). Shared by the options
 * strip and the colour / size keyboard shortcuts so "which object updates
 * live" stays in one place. Use the named wrappers below as store selectors.
 */
function activeObjectIdOfType(
  s: Pick<BoardState, "editingId" | "selection" | "board">,
  type: string,
): string | null {
  const id =
    s.editingId ??
    (s.selection.objectIds.length === 1 && s.selection.strokeIds.length === 0
      ? s.selection.objectIds[0]
      : null);
  if (id == null) return null;
  const o = s.board.objects.find((obj) => obj.id === id);
  return o && o.type === type ? o.id : null;
}

export function activeTextObjectId(
  s: Pick<BoardState, "editingId" | "selection" | "board">,
): string | null {
  return activeObjectIdOfType(s, "text");
}

export function activeMathObjectId(
  s: Pick<BoardState, "editingId" | "selection" | "board">,
): string | null {
  return activeObjectIdOfType(s, "mathtext");
}

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
    penSize: 6,
    textSize: 26,
    mathSize: 26,
    eraserSize: 45,
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
    setMathSize(n) {
      set({ mathSize: n });
    },
    setEraserSize(n) {
      set({ eraserSize: n });
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

// --- Yjs session -> store wiring --------------------------------------------
// Every committed transaction (local edit, remote edit, undo/redo, seed) lands
// here with the fresh mirror. Keep the selection valid (drop ids whose shape no
// longer exists - remote deletes, undo, eraser splits) and autosave the draft.
session.registerSessionCallbacks({
  onBoardChange(rawBoard, origin) {
    // Safety net for shapes that reach the store from any source — most
    // importantly a REMOTE shared doc, whose first sync fires here with legacy
    // content BEFORE session's post-sync migrateHandles can rewrite it. On a
    // current document migrateDocument returns the SAME reference, so this is a
    // cheap no-op that preserves the mirror's referential stability.
    const board = migrateDocument(rawBoard);
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
