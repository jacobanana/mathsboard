// Read-only window hooks for the Playwright end-to-end tests (e2e/).
//
// The board renders to <canvas>, so document content is invisible to DOM
// assertions; these expose snapshots of the live stores for tests to poll via
// page.waitForFunction. Strictly READ-ONLY - the tests drive the app through
// the real UI (pointer + keyboard), never through this hook.
//
// Shipped in production builds on purpose: the e2e suite runs against the
// compose stack's production build, and the hook reveals nothing the user's
// own devtools don't already show. Keep e2e/helpers.ts's Window declaration
// in sync with this shape.

import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import type { BoardDocument } from "@/board/types";

export interface E2EHooks {
  /** The current BoardDocument mirror (plain data). */
  board(): BoardDocument;
  /** Collab session state: mode/status/synced + lightweight peer info. */
  collab(): {
    mode: "solo" | "shared";
    boardId: string | null;
    status: string;
    synced: boolean;
    self: { name: string; color: string } | null;
    peers: {
      name: string;
      color: string;
      cursor: { x: number; y: number } | null;
      selection: { objectIds: string[]; strokeIds: string[] } | null;
    }[];
  };
}

declare global {
  interface Window {
    __mathsboard?: E2EHooks;
  }
}

window.__mathsboard = {
  board() {
    return useBoardStore.getState().board;
  },
  collab() {
    const c = useCollabStore.getState();
    return {
      mode: c.mode,
      boardId: c.boardId,
      status: c.status,
      synced: c.synced,
      self: c.self,
      peers: c.peers.map((p) => ({
        name: p.name,
        color: p.color,
        cursor: p.cursor,
        selection: p.selection,
      })),
    };
  },
};
