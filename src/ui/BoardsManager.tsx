// The whiteboard manager (the "Boards" modal body). Lists every saved board and
// lets you Save / Save as / New / Open / Rename / Delete. Renders ONLY the card
// body per the dialog contract — the host wraps it in <Modal>.
//
// The current whiteboard is a continuously-autosaved DRAFT (store.dirty tracks
// whether it diverges from its linked library board). Saving is what writes the
// draft into the library: Save overwrites the linked board ("save over the
// same"); Save as creates a new one. Opening / New replace the draft, so we warn
// first when there are unsaved changes.
//
// Sub-flows (name prompt, confirm) swap into THIS card rather than opening a
// nested modal, so there is only ever one scrim.

import { useCallback, useEffect, useState } from "react";
import { isSavedBoard, useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { formatBoardCode, isShortCode } from "@/collab/session";
import type { BoardSummary } from "@/board/types";
import { NamePrompt } from "@/ui/NamePrompt";

interface BoardsManagerProps {
  onClose: () => void;
  /**
   * Override the "New board" action. The language board passes this to ask for
   * the languages first (langNew modal); when absent, New creates a blank board
   * straight away (the maths board).
   */
  onNewBoard?: () => void;
}

type View =
  | { v: "list" }
  | {
      v: "name";
      title: string;
      initial: string;
      confirmLabel: string;
      onName: (name: string) => void | Promise<void>;
    }
  | {
      v: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      onConfirm: () => void | Promise<void>;
    };

/** Compact "x ago" / date label for a board's last-saved time. */
function lastSaved(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function BoardsManager({ onClose, onNewBoard }: BoardsManagerProps): JSX.Element {
  const board = useBoardStore((s) => s.board);
  const sourceId = useBoardStore((s) => s.sourceId);
  const dirty = useBoardStore((s) => s.dirty);
  const listBoards = useBoardStore((s) => s.listBoards);
  const saveCurrent = useBoardStore((s) => s.saveCurrent);
  const saveAs = useBoardStore((s) => s.saveAs);
  const openBoard = useBoardStore((s) => s.openBoard);
  const joinBoard = useBoardStore((s) => s.joinBoard);
  const newBoard = useBoardStore((s) => s.newBoard);
  const renameBoard = useBoardStore((s) => s.renameBoard);
  const deleteBoard = useBoardStore((s) => s.deleteBoard);
  // The current board is a REMOTE (shared) board while connected, else the
  // linked LOCAL board. That decides which library row reads as "open now".
  const shared = useCollabStore((s) => s.mode === "shared");
  const collabBoardId = useCollabStore((s) => s.boardId);
  const currentId = shared ? collabBoardId : sourceId;

  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [view, setView] = useState<View>({ v: "list" });

  const refresh = useCallback(async () => {
    setBoards(await listBoards());
  }, [listBoards]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const backToList = useCallback(() => setView({ v: "list" }), []);

  // --- Name prompt: Save-as (solo) OR rename-the-shared-board (shared) ---
  // For a shared board, saveAs renames the ONLINE doc for everyone rather than
  // writing a local copy, so the prompt reads as a rename and prefills the name.
  const promptSaveAs = useCallback(() => {
    setView({
      v: "name",
      title: shared ? "Rename shared board" : "Save board as",
      initial: shared || sourceId ? board.name : "",
      confirmLabel: shared ? "Rename" : "Save",
      onName: async (name) => {
        await saveAs(name);
        await refresh();
        backToList();
      },
    });
  }, [shared, sourceId, board.name, saveAs, refresh, backToList]);

  const handleSave = useCallback(async () => {
    const { needsName } = await saveCurrent();
    if (needsName) promptSaveAs();
    else await refresh();
  }, [saveCurrent, promptSaveAs, refresh]);

  // --- New / Open: replace the draft, so guard unsaved changes first ---
  const guardedSwitch = useCallback(
    (run: () => Promise<void>) => {
      if (!dirty) {
        void run();
        return;
      }
      setView({
        v: "confirm",
        title: "Unsaved changes",
        message:
          "The current board has unsaved changes that will be lost. Save it first, or discard and continue?",
        confirmLabel: "Discard & continue",
        onConfirm: run,
      });
    },
    [dirty],
  );

  const handleNew = useCallback(() => {
    guardedSwitch(async () => {
      // Language board: hand off to the language-picker step, which creates the
      // board itself once the pair is chosen. Otherwise create a blank board.
      if (onNewBoard) {
        onNewBoard();
        return;
      }
      await newBoard();
      onClose();
    });
  }, [guardedSwitch, newBoard, onClose, onNewBoard]);

  const handleOpen = useCallback(
    (b: BoardSummary) => {
      guardedSwitch(async () => {
        // A remote board lives online: opening it re-joins the shared session
        // (reloading its content from the online store) rather than reading
        // local content. A local board opens from localStorage as before.
        if (b.remote) await joinBoard(b.id, "library");
        else await openBoard(b.id);
        onClose();
      });
    },
    [guardedSwitch, joinBoard, openBoard, onClose],
  );

  const handleRename = useCallback(
    (id: string, current: string) => {
      setView({
        v: "name",
        title: "Rename board",
        initial: current,
        confirmLabel: "Rename",
        onName: async (name) => {
          await renameBoard(id, name);
          await refresh();
          backToList();
        },
      });
    },
    [renameBoard, refresh, backToList],
  );

  const handleDelete = useCallback(
    (b: BoardSummary) => {
      setView({
        v: "confirm",
        // Removing a remote board only forgets it from THIS list; the online
        // board itself is untouched and others can still open it by code.
        title: b.remote ? "Remove shared board" : "Delete board",
        message: b.remote
          ? `Remove “${b.name}” from your boards? It stays online for anyone with the code.`
          : `Delete “${b.name}”? This can’t be undone.`,
        confirmLabel: b.remote ? "Remove" : "Delete",
        onConfirm: async () => {
          await deleteBoard(b.id);
          await refresh();
          backToList();
        },
      });
    },
    [deleteBoard, refresh, backToList],
  );

  if (view.v === "name") {
    return (
      <NamePrompt
        title={view.title}
        initial={view.initial}
        confirmLabel={view.confirmLabel}
        onSubmit={view.onName}
        onCancel={backToList}
      />
    );
  }

  if (view.v === "confirm") {
    return (
      <>
        <h2>{view.title}</h2>
        <p className="hint">{view.message}</p>
        <div className="card-actions">
          <button className="btn" onClick={backToList}>
            Cancel
          </button>
          <button
            className="btn primary danger"
            onClick={() => void view.onConfirm()}
          >
            {view.confirmLabel}
          </button>
        </div>
      </>
    );
  }

  const displayName = isSavedBoard(sourceId, shared) ? board.name : "Untitled draft";
  const statusText = shared
    ? "Shared online — everyone edits together"
    : !sourceId
      ? "Draft — not saved yet"
      : dirty
        ? "Unsaved changes"
        : "All changes saved";

  return (
    <>
      <h2>Boards</h2>
      <p className="hint">
        {shared
          ? "This board is shared online — everyone edits it together and its name is shared with them. Rename it below to change the name for all."
          : "Your current board autosaves as a draft. Save it to keep it in your library — Save overwrites it, Save as makes a copy."}
      </p>

      <div className="bm-current">
        <div className="bm-current-info">
          <div className="bm-current-name">
            {displayName}
            {dirty && <span className="bm-dot" title="Unsaved changes" />}
          </div>
          <div className="bm-current-status">{statusText}</div>
        </div>
        <div className="bm-current-actions">
          {shared ? (
            // A shared board is saved online continuously — no local Save. The
            // one action is naming it, which renames it for every collaborator.
            <button className="btn small primary" onClick={promptSaveAs}>
              Rename…
            </button>
          ) : (
            <>
              <button
                className="btn small primary"
                onClick={() => void handleSave()}
              >
                Save
              </button>
              <button className="btn small" onClick={promptSaveAs}>
                Save as…
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bm-listhead">
        <span className="subhead">Saved boards</span>
        <button className="btn small" onClick={handleNew}>
          ＋ New board
        </button>
      </div>

      {boards.length === 0 ? (
        <p className="bm-empty">
          No saved boards yet. Press <b>Save</b> above to add this one.
        </p>
      ) : (
        <div className="bm-list">
          {boards.map((b) => {
            const isCurrent = b.id === currentId;
            const code = b.remote && isShortCode(b.id) ? formatBoardCode(b.id) : null;
            return (
              <div
                key={b.id}
                className={"bm-row" + (isCurrent ? " current" : "")}
              >
                <div className="bm-row-main">
                  <div className="bm-row-name">
                    {b.name}
                    {b.remote && <span className="bm-tag">Shared</span>}
                  </div>
                  <div className="bm-row-time">
                    {isCurrent ? "Open now · " : ""}
                    {lastSaved(b.updatedAt)}
                    {code ? " · " + code : ""}
                  </div>
                </div>
                <div className="bm-row-actions">
                  <button
                    className="btn small"
                    disabled={isCurrent}
                    title={
                      isCurrent
                        ? "This board is open"
                        : b.remote
                          ? "Rejoin this shared board"
                          : "Open this board"
                    }
                    onClick={() => handleOpen(b)}
                  >
                    Open
                  </button>
                  {/* A shared board is renamed only while you're IN it (so the
                      new name propagates to everyone) — via the top panel's
                      Rename…. Renaming from here would only relabel this device's
                      pointer and be overwritten on the next reconnect. */}
                  {!b.remote && (
                    <button
                      className="btn small"
                      onClick={() => handleRename(b.id, b.name)}
                    >
                      Rename
                    </button>
                  )}
                  <button
                    className="btn small danger"
                    onClick={() => handleDelete(b)}
                  >
                    {b.remote ? "Remove" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card-actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}
