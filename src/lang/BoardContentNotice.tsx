// "THIS BOARD BROUGHT ITS OWN CONTENT" — the on-board notice (language board
// only). When an opened or joined board carries content packs that aren't in
// this device's library, the packs are already loaded and teaching (see
// adoptBoardContent); this banner just SAYS so, and offers to save them to the
// library for reuse in the user's own boards. Purely informational — dismissing
// it changes nothing, and it disappears by itself once every carried pack is in
// the library (saving drops the board copies from the registry's board layer).

import { useState, useSyncExternalStore } from "react";
import {
  adoptBoardContent,
  boardPacksNow,
  importPackJson,
  subscribeContent,
} from "@/lang/content/registry";
import { useBoardStore } from "@/board/store";
import { useUiStore } from "@/ui/uiStore";

export function BoardContentNotice(): JSX.Element | null {
  const boardId = useBoardStore((s) => s.board.id);
  useSyncExternalStore(subscribeContent, () =>
    boardPacksNow()
      .map((p) => p.id)
      .join(","),
  );
  // Which board's notice was dismissed — a new board gets its notice back.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const packs = boardPacksNow();
  if (packs.length === 0 || dismissedFor === boardId) return null;

  const names = packs.map((p) => p.name).join(", ");

  function saveAll(): void {
    const saved = boardPacksNow();
    for (const p of saved) importPackJson(JSON.stringify(p));
    // Importing activates only the LAST pack; re-adopt the full set so a board
    // carrying several packs keeps them all teaching after the save.
    if (saved.length > 1) adoptBoardContent(saved);
    useUiStore.getState().flashSaved();
  }

  return (
    <div className="board-notice" role="status">
      <span className="board-notice-text">
        This board comes with its own content — <strong>{names}</strong> is
        loaded and ready.
      </span>
      <span className="board-notice-actions">
        <button className="btn small" onClick={saveAll}>
          Save to my library
        </button>
        <button
          className="btn small board-notice-dismiss"
          onClick={() => setDismissedFor(boardId)}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </span>
    </div>
  );
}
