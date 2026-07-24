// The language board's landing hub — the one clean interface for GETTING INTO a
// board. It fronts every plain page load (share links bypass it and join
// directly) and is also what the top-left board-title chip reopens, so the two
// entry points the learner reaches for present exactly the same three choices:
//
//   1. NEW board     — pick a language + content, then start (the langNew flow).
//   2. OPEN a board  — reopen one saved earlier (the boards manager).
//   3. JOIN a board  — type a code someone shared (revealed inline; collab only).
//
// A returning learner with work in progress gets a RESUME bar above the three,
// so "carry on where I left off" is one press and doesn't hide behind "open a
// saved board" (an unsaved draft has no library entry to open anyway). init()
// loads that draft behind this screen, so resuming just closes the hub.
//
// The old welcome mixed a standalone I-speak/I-learn picker in with these
// actions; that choice now lives inside the New-board flow, so language is asked
// exactly once — when it matters — instead of twice.

import { useEffect, useRef, useState } from "react";
import { useBoardStore } from "@/board/store";
import { COLLAB_ENABLED } from "@/config";
import { PROFILE } from "@/boardProfile";
import { JoinForm } from "@/ui/JoinForm";

interface LangWelcomeProps {
  /** Resume the current board (Continue; also called after a successful join). */
  onClose: () => void;
  /** Start the new-board flow (choose language + content). */
  onNew: () => void;
  /** Open the boards manager to reopen a saved board. */
  onOpen: () => void;
  /** Open the reading-voices settings. */
  onVoices?: () => void;
}

export function LangWelcome({
  onClose,
  onNew,
  onOpen,
  onVoices,
}: LangWelcomeProps): JSX.Element {
  const board = useBoardStore((s) => s.board);
  const sourceId = useBoardStore((s) => s.sourceId);

  // init() is loading the draft while this renders; gate the actions until it
  // has landed so a lightning-fast click can't race the async load.
  const pending = board.id === "pending";
  const blank = board.objects.length === 0 && board.strokes.length === 0;
  // Only offer "resume" when there's actually something to come back to: a saved
  // board is open, or the draft already has work on it. A brand-new blank draft
  // has nothing to resume, so the three choices stand on their own.
  const resumable = !pending && (sourceId != null || !blank);
  const resumeName = sourceId ? board.name : "Untitled draft";

  // The Join choice expands its code form inline rather than opening another
  // screen, so all three options live on one uncluttered hub.
  const [joinOpen, setJoinOpen] = useState(false);

  // Focus the primary action (Enter-key default) once the draft load enables it.
  // When there's work to resume that's the resume bar; otherwise it's New board.
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pending) primaryRef.current?.focus();
  }, [pending]);

  return (
    <div className="lang-welcome">
      <h2>{PROFILE.appName}</h2>
      <p className="hint">Start a new board, reopen one, or join with a code.</p>

      {resumable && (
        <button
          ref={primaryRef}
          type="button"
          className="lw-resume"
          id="welcomeContinue"
          onClick={onClose}
        >
          <span className="lw-ico" aria-hidden>
            ↩︎
          </span>
          <span className="lw-text">
            <span className="lw-title">Continue — {resumeName}</span>
            <span className="lw-sub">Pick up where you left off</span>
          </span>
        </button>
      )}

      <div className="lw-options">
        {/* 1 — NEW board: choose a language + content, then start. The primary
            action for a first-time visitor, so it leads and is brand-dark. */}
        <button
          ref={resumable ? undefined : primaryRef}
          type="button"
          className="lw-option primary"
          id="welcomeNew"
          disabled={pending}
          onClick={onNew}
        >
          <span className="lw-ico" aria-hidden>
            ✏️
          </span>
          <span className="lw-text">
            <span className="lw-title">New board</span>
            <span className="lw-sub">Choose a language and content</span>
          </span>
          <span className="lw-arrow" aria-hidden>
            →
          </span>
        </button>

        {/* 2 — OPEN a saved board (the boards manager). */}
        <button
          type="button"
          className="lw-option"
          id="welcomeBoards"
          disabled={pending}
          onClick={onOpen}
        >
          <span className="lw-ico" aria-hidden>
            📂
          </span>
          <span className="lw-text">
            <span className="lw-title">Open a saved board</span>
            <span className="lw-sub">Reopen one you saved before</span>
          </span>
          <span className="lw-arrow" aria-hidden>
            →
          </span>
        </button>

        {/* 3 — JOIN with a code (collab builds only). Expands its form in place
            so the whole flow stays on this one hub. */}
        {COLLAB_ENABLED && (
          <>
            <button
              type="button"
              className={"lw-option" + (joinOpen ? " open" : "")}
              id="welcomeJoin"
              disabled={pending}
              aria-expanded={joinOpen}
              onClick={() => setJoinOpen((o) => !o)}
            >
              <span className="lw-ico" aria-hidden>
                🔗
              </span>
              <span className="lw-text">
                <span className="lw-title">Join a board</span>
                <span className="lw-sub">Enter a code someone shared</span>
              </span>
              <span className="lw-arrow" aria-hidden>
                {joinOpen ? "▾" : "→"}
              </span>
            </button>
            {joinOpen && (
              <div className="lw-join">
                <JoinForm autoFocus disabled={pending} onJoined={onClose} />
              </div>
            )}
          </>
        )}
      </div>

      {onVoices && (
        <button type="button" className="welcome-voices-link" onClick={onVoices}>
          🔊 Choose reading voices
        </button>
      )}
    </div>
  );
}
