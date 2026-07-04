// The toolbar burger ("☰") and its popover: the lesser-used actions that used
// to crowd the toolbar — Join / Share, Paper, Boards, Save image. Owns its own
// open state; closes on pick or any outside click (same pattern as PaperMenu).
//
// While the board is SHARED, Join and Share are NOT in here: Join is hidden
// entirely and Share lives on the toolbar as the live status chip (see
// Toolbar). The Paper item re-anchors the existing PaperMenu popover to the
// burger button, which stays mounted while the menu closes.

import { useRef, useState } from "react";
import { useCollabStore } from "@/collab/collabStore";
import { COLLAB_ENABLED } from "@/config";
import { Popover } from "@/ui/Popover";
import { keyHint } from "@/ui/shortcuts";
import { GLYPH } from "@/ui/icons";

export interface OverflowMenuProps {
  onJoin: () => void;
  onShare: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onBoards: () => void;
  onSaveImage: () => void;
  /** Open the keyboard-shortcuts help sheet. */
  onHelp: () => void;
}

export function OverflowMenu(props: OverflowMenuProps): JSX.Element {
  const collabMode = useCollabStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  /** Close the menu, then run the action. */
  function pick(action: () => void): () => void {
    return () => {
      setOpen(false);
      action();
    };
  }

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
      <Popover
        anchor={open ? btnRef.current : null}
        onClose={() => setOpen(false)}
        align="right"
        id="overflowMenu"
      >
        {COLLAB_ENABLED && collabMode !== "shared" && (
            <button
              id="joinBtn"
              title="Join a board someone shared — enter their code"
              onClick={pick(props.onJoin)}
            >
              <span className="ico">{GLYPH.join}</span>
              <span className="label">Join a board</span>
            </button>
          )}
          {COLLAB_ENABLED && collabMode !== "shared" && (
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
            title={`Boards — save, open, rename & delete whiteboards (${keyHint(
              "save",
            )} save · ${keyHint("saveAs")} save as)`}
            onClick={pick(props.onBoards)}
          >
            <span className="ico">{GLYPH.boards}</span>
            <span className="label">Boards</span>
          </button>
          <button id="saveBtn" onClick={pick(props.onSaveImage)}>
            <span className="ico">{GLYPH.save}</span>
            <span className="label">Save image</span>
          </button>
          <button
            id="shortcutsBtn"
            title={`Keyboard shortcuts (${keyHint("help")})`}
            onClick={pick(props.onHelp)}
          >
            <span className="ico">{GLYPH.keyboard}</span>
            <span className="label">Keyboard shortcuts</span>
          </button>
      </Popover>
    </>
  );
}
