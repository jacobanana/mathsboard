// Zustand store for collaboration session state + live presence.
//
// Deliberately separate from the board store: everything here is EPHEMERAL
// session/awareness data (who is connected, where their cursors are). None of
// it is ever written into the persisted Yjs document - presence travels only
// over the Yjs awareness protocol and vanishes when a client disconnects.
//
// Written by src/collab/session.ts; read by the toolbar (status / who's here)
// and the PresenceLayer (remote cursors).

import { create } from "zustand";

/** Provider connection status, plus "offline" when no provider is attached. */
export type CollabStatus =
  | "offline"
  | "connecting"
  | "handshaking"
  | "connected"
  | "error";

/**
 * A one-shot "guide everyone's view" command sent while laser-pointing (world
 * coordinates). `seq` is a per-sender counter so receivers act exactly once per
 * command. `point` recentres a hidden spot into view; `rect` zooms the view to
 * fit an area. Ephemeral awareness, never written into the document.
 */
export interface LaserFocus {
  seq: number;
  kind: "point" | "rect";
  x: number;
  y: number;
  /** Present for kind "rect": the area's width/height (world px). */
  w?: number;
  h?: number;
}

/**
 * A live laser-pointer trail: the recent points (WORLD coords, oldest→newest)
 * plus the pointer's chosen colour, so a peer's laser renders in their colour.
 * Ephemeral like the cursor — never written into the document.
 */
export interface LaserTrail {
  points: { x: number; y: number }[];
  color: string;
}

export interface PeerPresence {
  clientId: number;
  name: string;
  color: string;
  /** Cursor position in WORLD coordinates (each user has their own camera). */
  cursor: { x: number; y: number } | null;
  /** Live laser trail + colour, or null when the peer isn't pointing. */
  laser: LaserTrail | null;
  /**
   * Latest laser "guide my view" command from this peer (recentre / zoom), or
   * null. Applied by whoever RECEIVES it (director model): the pointer drives
   * the other users' cameras, never their own. See PresenceLayer.
   */
  laserFocus: LaserFocus | null;
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
