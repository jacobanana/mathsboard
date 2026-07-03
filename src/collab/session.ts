// The collaboration session singleton.
//
// Owns the live Y.Doc (and, when shared, the Y-Sweet provider + awareness) and
// exposes the WRITE API the board store's document actions call. There is
// always exactly one active session:
//
//   solo   - a local Y.Doc, no network. The same code path as shared, so the
//            store never branches on mode for document edits.
//   shared - the doc is connected to /api/token -> Y-Sweet under a board id;
//            edits sync both ways and presence flows over awareness.
//
// The store subscribes via registerSessionCallbacks: every committed
// transaction (local OR remote) re-reads the mirror and hands the plain
// BoardDocument back to the store, which is what the canvas renders from.
// Undo/redo is a Y.UndoManager tracking ONLY LOCAL_ORIGIN transactions - your
// undo never reverts a collaborator's work (see docModel.ts for the merge
// semantics commentary).

import * as Y from "yjs";
import { createYjsProvider, YSweetProvider } from "@y-sweet/client";
import type { Awareness } from "y-protocols/awareness";
import type {
  AnyBoardObject,
  Background,
  BoardDocument,
  Stroke,
} from "@/board/types";
import {
  DocHandles,
  DocMirror,
  LOCAL_ORIGIN,
  SEED_ORIGIN,
  openHandles,
  seedDoc,
  toYShape,
} from "@/collab/docModel";
import { useCollabStore, type PeerPresence } from "@/collab/collabStore";
import { colorForClient } from "@/collab/profile";

const TOKEN_ENDPOINT = "/api/token";

// --- store linkage (callbacks avoid a session <-> store import cycle) -------

export interface SessionCallbacks {
  /**
   * A transaction changed the document; `board` is the fresh mirror. `origin`
   * is the Yjs transaction origin: SEED_ORIGIN for programmatic loading (the
   * store must not mark the draft dirty for it), LOCAL_ORIGIN for this user's
   * edits, the provider instance for remote edits.
   */
  onBoardChange(board: BoardDocument, origin: unknown): void;
  onUndoState(canUndo: boolean, canRedo: boolean): void;
}

let callbacks: SessionCallbacks | null = null;

export function registerSessionCallbacks(cb: SessionCallbacks): void {
  callbacks = cb;
}

// --- the active session ------------------------------------------------------

interface ActiveSession {
  mode: "solo" | "shared";
  /** Shared board id (= the Y-Sweet doc id); null in solo mode. */
  boardId: string | null;
  h: DocHandles;
  mirror: DocMirror;
  undo: Y.UndoManager;
  provider: YSweetProvider | null;
  dispose: () => void;
}

let session: ActiveSession | null = null;

function must(): ActiveSession {
  if (!session) throw new Error("No active collab session (init not run?)");
  return session;
}

/** Run `fn` as one LOCAL user edit (one merge unit, one undo candidate). */
function tx(fn: () => void): void {
  must().h.doc.transact(fn, LOCAL_ORIGIN);
}

function disposeSession(): void {
  if (!session) return;
  session.dispose();
  session = null;
}

/**
 * Shared setup for both modes: mirror, undo manager, observers.
 * Observers only mark which shape ids changed; ONE mirror read + store update
 * is emitted per transaction from afterTransaction (which Yjs fires after all
 * observer callbacks), so a multi-map transaction doesn't triple-render.
 */
function buildCore(
  doc: Y.Doc,
  mode: "solo" | "shared",
  boardId: string | null,
): ActiveSession {
  const h = openHandles(doc);
  const mirror = new DocMirror(h);

  let docDirty = false;
  const collectChanged =
    (top: Y.Map<Y.Map<unknown>>, invalidate: (id: string) => void) =>
    (events: Y.YEvent<Y.Map<unknown>>[]) => {
      docDirty = true;
      for (const ev of events) {
        if (ev.target === top) {
          // Adds/deletes/replacements of whole shapes in the top-level map.
          (ev as Y.YMapEvent<Y.Map<unknown>>).keysChanged.forEach(invalidate);
        } else {
          // Nested shape map edit; path[0] is the shape's id in the top map.
          invalidate(String(ev.path[0]));
        }
      }
    };
  const onObjects = collectChanged(h.objects, (id) =>
    mirror.invalidateObject(id),
  );
  const onStrokes = collectChanged(h.strokes, (id) =>
    mirror.invalidateStroke(id),
  );
  const onMeta = () => {
    docDirty = true;
  };
  const onAfterTransaction = (tr: Y.Transaction) => {
    if (!docDirty) return;
    docDirty = false;
    callbacks?.onBoardChange(mirror.read(boardId ?? doc.guid), tr.origin);
  };
  h.objects.observeDeep(onObjects);
  h.strokes.observeDeep(onStrokes);
  h.meta.observe(onMeta);
  doc.on("afterTransaction", onAfterTransaction);

  // Undo/redo: track ONLY this user's edits. captureTimeout Infinity merges
  // every consecutive local transaction into the current step; the store's
  // pushHistory() -> stopCapture() marks step boundaries, exactly reproducing
  // the old snapshot-per-action behaviour (a whole drag = one undo step).
  const undo = new Y.UndoManager([h.objects, h.strokes, h.meta], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: Number.POSITIVE_INFINITY,
  });
  const onStack = () => {
    callbacks?.onUndoState(undo.undoStack.length > 0, undo.redoStack.length > 0);
  };
  undo.on("stack-item-added", onStack);
  undo.on("stack-item-popped", onStack);
  undo.on("stack-cleared", onStack);

  return {
    mode,
    boardId,
    h,
    mirror,
    undo,
    provider: null,
    dispose: () => {
      undo.destroy();
      h.objects.unobserveDeep(onObjects);
      h.strokes.unobserveDeep(onStrokes);
      h.meta.unobserve(onMeta);
      doc.off("afterTransaction", onAfterTransaction);
      doc.destroy();
    },
  };
}

// --- lifecycle ---------------------------------------------------------------

/** Start (or restart) a local-only session seeded from `board`. */
export function startSolo(board: BoardDocument): BoardDocument {
  disposeSession();
  const doc = new Y.Doc();
  session = buildCore(doc, "solo", null);
  seedDoc(session.h, board);
  useCollabStore.setState({
    mode: "solo",
    boardId: null,
    status: "offline",
    synced: false,
    peers: [],
    self: null,
  });
  callbacks?.onUndoState(false, false);
  return session.mirror.read(board.id);
}

/**
 * Start a SHARED session on `boardId` via the token endpoint.
 * `seedFrom` (share flow) preloads the doc with the current board before
 * connecting; joining someone's link omits it and the first server sync
 * populates the board. Offline edits are cached in IndexedDB by the provider
 * and reconcile through normal Yjs sync on reconnect.
 */
export function joinShared(
  boardId: string,
  name: string,
  seedFrom?: BoardDocument,
): BoardDocument {
  disposeSession();
  const doc = new Y.Doc();
  const core = buildCore(doc, "shared", boardId);
  session = core;
  if (seedFrom) seedDoc(core.h, { ...seedFrom, id: boardId });

  const color = colorForClient(doc.clientID);
  const provider = createYjsProvider(doc, boardId, TOKEN_ENDPOINT, {
    offlineSupport: true,
    showDebuggerLink: false,
  });
  core.provider = provider;

  // PRESENCE - awareness protocol only, never written into the document.
  // Local state: identity + cursor + selection. Peers are read back out of
  // awareness.getStates() on every change and mirrored into the collab store.
  const awareness = provider.awareness;
  awareness.setLocalState({ user: { name, color }, cursor: null, selection: null });
  const onAwareness = () => {
    useCollabStore.setState({ peers: readPeers(awareness, doc.clientID) });
  };
  awareness.on("change", onAwareness);

  const onStatus = (status: string) => {
    useCollabStore.setState({
      status: status as ReturnType<typeof useCollabStore.getState>["status"],
    });
  };
  const onSynced = () => useCollabStore.setState({ synced: true });
  provider.on("connection-status", onStatus);
  provider.on("sync", onSynced);

  const coreDispose = core.dispose;
  core.dispose = () => {
    awareness.off("change", onAwareness);
    provider.off("connection-status", onStatus);
    provider.off("sync", onSynced);
    provider.destroy();
    coreDispose();
  };

  useCollabStore.setState({
    mode: "shared",
    boardId,
    status: "connecting",
    synced: false,
    peers: readPeers(awareness, doc.clientID),
    self: { name, color },
  });
  callbacks?.onUndoState(false, false);
  return core.mirror.read(boardId);
}

function readPeers(awareness: Awareness, ownId: number): PeerPresence[] {
  const peers: PeerPresence[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === ownId || !state) return;
    const user = (state.user ?? {}) as { name?: string; color?: string };
    peers.push({
      clientId,
      name: user.name || "Guest",
      color: user.color || colorForClient(clientId),
      cursor: (state.cursor as PeerPresence["cursor"]) ?? null,
      selection: (state.selection as PeerPresence["selection"]) ?? null,
    });
  });
  peers.sort((a, b) => a.clientId - b.clientId);
  return peers;
}

/** The current document as a plain BoardDocument (for saving/leaving). */
export function currentBoard(): BoardDocument {
  const s = must();
  return s.mirror.read(s.boardId ?? s.h.doc.guid);
}

// --- presence publishing (ephemeral; throttling is the caller's job) ---------

export function publishCursor(pos: { x: number; y: number } | null): void {
  session?.provider?.awareness.setLocalStateField("cursor", pos);
}

export function publishSelection(
  sel: { objectIds: string[]; strokeIds: string[] } | null,
): void {
  session?.provider?.awareness.setLocalStateField(
    "selection",
    sel && sel.objectIds.length + sel.strokeIds.length > 0 ? sel : null,
  );
}

// --- undo/redo ----------------------------------------------------------------

/** Boundary marker: the NEXT local edit starts a fresh undo step. */
export function stopCapture(): void {
  session?.undo.stopCapturing();
}
export function undo(): void {
  session?.undo.undo();
}
export function redo(): void {
  session?.undo.redo();
}

// --- document write API (all under LOCAL_ORIGIN, one transaction per call) ----

/** Z-order key for newly created shapes: later = drawn on top. Seeded shapes
 *  use small array indices, so timestamps always sort after them. */
const nextOrder = (): number => Date.now();

export function insertObject(obj: AnyBoardObject): void {
  const { objects } = must().h;
  tx(() => objects.set(obj.id, toYShape({ order: nextOrder(), ...obj })));
}

/** Patch fields on one object - per-field CRDT writes (see docModel.ts). */
export function patchObject(
  id: string,
  patch: Record<string, unknown>,
): void {
  const { objects } = must().h;
  tx(() => {
    const y = objects.get(id);
    if (!y) return; // deleted concurrently - drop the edit, delete wins
    for (const [k, v] of Object.entries(patch)) {
      if (y.get(k) !== v) y.set(k, v);
    }
  });
}

export function insertStroke(stroke: Stroke): void {
  const { strokes } = must().h;
  tx(() => strokes.set(stroke.id, toYShape({ order: nextOrder(), ...stroke })));
}

/** Translate a set of objects + strokes by (dx, dy) as ONE transaction. */
export function translateShapes(
  objectIds: string[],
  strokeIds: string[],
  dx: number,
  dy: number,
): void {
  const { objects, strokes } = must().h;
  tx(() => {
    for (const id of objectIds) {
      const y = objects.get(id);
      if (!y) continue;
      y.set("x", (y.get("x") as number) + dx);
      y.set("y", (y.get("y") as number) + dy);
    }
    for (const id of strokeIds) {
      const y = strokes.get(id);
      if (!y) continue;
      const pts = y.get("points") as { x: number; y: number }[];
      // Whole-field rewrite by design: point lists never merge element-wise.
      y.set(
        "points",
        pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      );
    }
  });
}

export function removeShapes(objectIds: string[], strokeIds: string[]): void {
  const { objects, strokes } = must().h;
  tx(() => {
    for (const id of objectIds) objects.delete(id);
    for (const id of strokeIds) strokes.delete(id);
  });
}

/**
 * Reconcile the strokes map to `next` (the geometric-eraser result): delete
 * vanished ids, rewrite trimmed point lists, insert new split fragments.
 * Fragments inherit their parent's `order` so z-order survives the split.
 */
export function reconcileStrokes(next: Stroke[]): void {
  const { strokes } = must().h;
  tx(() => {
    const keep = new Set(next.map((s) => s.id));
    for (const id of [...strokes.keys()]) {
      if (!keep.has(id)) strokes.delete(id);
    }
    for (const s of next) {
      const y = strokes.get(s.id);
      if (!y) strokes.set(s.id, toYShape({ ...s }));
      else if (y.get("points") !== s.points) y.set("points", s.points);
    }
  });
}

export function setBackground(bg: Background): void {
  const { meta } = must().h;
  tx(() => meta.set("background", bg));
}

export function setBoardName(name: string): void {
  // Lifecycle rename (Save as / Boards manager), not a canvas edit: run under
  // SEED_ORIGIN so it syncs to peers but never lands on the undo stack -
  // matching the old behaviour where names were outside history snapshots.
  const s = must();
  s.h.doc.transact(() => s.h.meta.set("name", name), SEED_ORIGIN);
}

// --- board id <-> URL ----------------------------------------------------------

const BOARD_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function boardIdFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get("board");
  return id && BOARD_ID_RE.test(id) ? id : null;
}

export function putBoardIdInUrl(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("board", id);
  window.history.pushState({}, "", url);
}

export function clearBoardIdFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("board")) return;
  url.searchParams.delete("board");
  window.history.pushState({}, "", url);
}

/** The copyable share link for the current shared board. */
export function shareLink(): string {
  const url = new URL(window.location.href);
  const id = useCollabStore.getState().boardId;
  if (id) url.searchParams.set("board", id);
  return url.toString();
}
