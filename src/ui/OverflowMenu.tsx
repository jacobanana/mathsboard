// The toolbar burger ("☰") and its popover: the lesser-used actions that used
// to crowd the toolbar — Join / Share, Paper, Boards, Save image. Owns its own
// open state; closes on pick or any outside click (same pattern as PaperMenu).
//
// While the board is SHARED, Join and Share are NOT in here: Join is hidden
// entirely and Share lives on the toolbar as the live status chip (see
// Toolbar). The Paper item re-anchors the existing PaperMenu popover to the
// burger button, which stays mounted while the menu closes.

import { useEffect, useRef, useState } from "react";
import { useCollabStore } from "@/collab/collabStore";
import { GLYPH } from "@/ui/icons";

export interface OverflowMenuProps {
  onJoin: () => void;
  onShare: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onBoards: () => void;
  onSaveImage: () => void;
}

export function OverflowMenu(props: OverflowMenuProps): JSX.Element {
  const collabMode = useCollabStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick);
    };
  }, [open]);

  /** Close the menu, then run the action. */
  function pick(action: () => void): () => void {
    return () => {
      setOpen(false);
      action();
    };
  }

  const r = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        className={"btn" + (open ? " active" : "")}
        id="menuBtn"
        title="Menu — share, paper, boards, save image"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ico">☰</span>
      </button>
      {open && r && (
        <div
          id="overflowMenu"
          ref={menuRef}
          style={{
            top: r.bottom + 6,
            right: Math.max(6, window.innerWidth - r.right),
          }}
        >
          {collabMode !== "shared" && (
            <button
              id="joinBtn"
              title="Join a board someone shared — enter their code"
              onClick={pick(props.onJoin)}
            >
              <span className="ico">{GLYPH.join}</span>
              <span className="label">Join a board</span>
            </button>
          )}
          {collabMode !== "shared" && (
            <button
              id="shareBtn"
              title="Share this board with a link"
              onClick={pick(props.onShare)}
            >
              <span className="ico">{GLYPH.share}</span>
              <span className="label">Share this board</span>
            </button>
          )}
          <button
            id="paperBtn"
            title="Background paper — squares, lines or blank"
            onClick={() => {
              setOpen(false);
              if (btnRef.current) props.onPaper(btnRef.current);
            }}
          >
            <span className="ico">{GLYPH.paper}</span>
            <span className="label">Paper</span>
          </button>
          <button
            id="boardsBtn"
            title="Boards — save, open, rename & delete whiteboards (Ctrl+S save · Ctrl+Shift+S save as)"
            onClick={pick(props.onBoards)}
          >
            <span className="ico">{GLYPH.boards}</span>
            <span className="label">Boards</span>
          </button>
          <button id="saveBtn" onClick={pick(props.onSaveImage)}>
            <span className="ico">{GLYPH.save}</span>
            <span className="label">Save image</span>
          </button>
        </div>
      )}
    </>
  );
}
