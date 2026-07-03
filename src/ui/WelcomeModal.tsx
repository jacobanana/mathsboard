// The welcome screen — fronts every plain page load (opening a share link
// bypasses it and joins directly). It is a launcher, not a gate: init() loads
// the working draft behind it while it shows, so "Continue" simply closes it
// (as does clicking the backdrop / Escape), while Join / New board / Open a
// saved board replace the draft with something else.
//
// "Continue" is the visually primary action and takes focus once the draft
// has loaded, so a returning solo user is one Enter press from their board.

import { useEffect, useRef } from "react";
import { useBoardStore } from "@/board/store";
import { COLLAB_ENABLED } from "@/config";
import { JoinForm } from "@/ui/JoinForm";

interface WelcomeModalProps {
  /** Close the welcome screen (Continue; also called after join/new). */
  onClose: () => void;
  /** Switch to the Boards manager to open a saved board. */
  onOpenBoards: () => void;
}

export function WelcomeModal({
  onClose,
  onOpenBoards,
}: WelcomeModalProps): JSX.Element {
  const board = useBoardStore((s) => s.board);
  const sourceId = useBoardStore((s) => s.sourceId);
  const newBoard = useBoardStore((s) => s.newBoard);

  // init() is loading the draft while this renders; gate the actions until it
  // has landed so a lightning-fast click can't race the async load.
  const pending = board.id === "pending";
  const blank = board.objects.length === 0 && board.strokes.length === 0;
  const continueLabel =
    !sourceId && blank
      ? "Start drawing"
      : "Continue — " + (sourceId ? board.name : "Untitled draft");

  // autoFocus can't work on a button that mounts disabled: focus it (for the
  // Enter-key default) once the draft load enables it.
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pending) continueRef.current?.focus();
  }, [pending]);

  return (
    <>
      <h2>Maths Board</h2>
      <p className="hint">
        {COLLAB_ENABLED
          ? "Pick up where you left off, or join a board someone shared with you."
          : "Pick up where you left off."}
      </p>

      <button
        ref={continueRef}
        className="btn primary welcome-continue"
        id="welcomeContinue"
        disabled={pending}
        onClick={onClose}
      >
        {continueLabel}
      </button>
      <div className="welcome-row">
        <button
          className="btn"
          id="welcomeNew"
          disabled={pending}
          onClick={() => {
            void newBoard();
            onClose();
          }}
        >
          New board
        </button>
        <button
          className="btn"
          id="welcomeBoards"
          disabled={pending}
          onClick={onOpenBoards}
        >
          Open a saved board…
        </button>
      </div>

      {COLLAB_ENABLED && (
        <>
          <div className="subhead">Join a board someone shared</div>
          <JoinForm disabled={pending} onJoined={onClose} />
        </>
      )}
    </>
  );
}
