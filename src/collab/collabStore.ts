// Zustand store for collaboration session state + live presence.
//
// Deliberately separate from the board store: everything here is EPHEMERAL
// session/awareness data (who is connected, where their cursors are). None of
// it is ever written into the persisted Yjs document - presence travels only
// over the Yjs awareness protocol and vanishes when a client disconnects.
//
// Written by src/collab/session.ts; read by the toolbar (status / who's here)
// and the PresenceLayer (remote cursors + selections).

import { create } from "zustand";

/** Provider connection status, plus "offline" when no provider is attached. */
export type CollabStatus =
  | "offline"
  | "connecting"
  | "handshaking"
  | "connected"
  | "error";

export interface PeerPresence {
  clientId: number;
  name: string;
  color: string;
  /** Cursor position in WORLD coordinates (each user has their own camera). */
  cursor: { x: number; y: number } | null;
  /** The peer's current selection, for remote-selection outlines. */
  selection: { objectIds: string[]; strokeIds: string[] } | null;
}

interface CollabState {
  /** "solo": local-only doc, no provider. "shared": connected to a board id. */
  mode: "solo" | "shared";
  boardId: string | null;
  status: CollabStatus;
  /** True once the first server sync completed for the current session. */
  synced: boolean;
  /** Remote participants (never includes this client). */
  peers: PeerPresence[];
  /** This client's own presence identity while shared. */
  self: { name: string; color: string } | null;
}

export const useCollabStore = create<CollabState>(() => ({
  mode: "solo",
  boardId: null,
  status: "offline",
  synced: false,
  peers: [],
  self: null,
}));
