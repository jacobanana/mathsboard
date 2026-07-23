// The toolbar burger ("☰") and its popover: the lesser-used actions that used
// to crowd the toolbar — Join, Paper, Boards, Save image, Shortcuts. Owns its
// own open state; closes on pick or any outside click (same pattern as
// PaperMenu).
//
// Share is NOT in here — it lives on the toolbar as an always-visible button
// just left of the burger (see Toolbar). Join is hidden while the board is
// SHARED. The Paper item re-anchors the existing PaperMenu popover to the
// burger button, which stays mounted while the menu closes.

import { useRef, useState } from "react";
import { useCollabStore } from "@/collab/collabStore";
import { COLLAB_ENABLED } from "@/config";
import { IS_LANGUAGE } from "@/subject";
import { Popover } from "@/ui/Popover";
import { keyHint } from "@/ui/shortcuts";
import {
  MenuIcon,
  JoinIcon,
  PaperIcon,
  BoardsIcon,
  SaveIcon,
  KeyboardIcon,
  AboutIcon,
  ContentIcon,
  PlusIcon,
  SpeakerIcon,
} from "@/ui/icons";

export interface OverflowMenuProps {
  onJoin: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onBoards: () => void;
  onSaveImage: () => void;
  /** Open the keyboard-shortcuts help sheet. */
  onHelp: () => void;
  /** Open the About & credits sheet (open source, privacy, licence). */
  onAbout: () => void;
  /** Open the content-creation help page (language board only). */
  onContent: () => void;
  /** Open the Contents page — loaded packs (language board only). */
  onLibrary: () => void;
  /** Open the text-to-speech voices settings (language board only). */
  onVoices: () => void;
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
        className={"btn small" + (open ? " active" : "")}
        id="menuBtn"
        title="Menu — paper, boards, save image, shortcuts"
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ico">
          <MenuIcon />
        </span>
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
              <span className="ico">
              <JoinIcon />
            </span>
              <span className="label">Join a board</span>
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
            <span className="ico">
              <PaperIcon />
            </span>
            <span className="label">Paper</span>
          </button>
          <button
            id="boardsBtn"
            title={`Boards — save, open, rename & delete whiteboards (${keyHint(
              "save",
            )} save · ${keyHint("saveAs")} save as)`}
            onClick={pick(props.onBoards)}
          >
            <span className="ico">
              <BoardsIcon />
            </span>
            <span className="label">Boards</span>
          </button>
          <button id="saveBtn" onClick={pick(props.onSaveImage)}>
            <span className="ico">
              <SaveIcon />
            </span>
            <span className="label">Save image</span>
          </button>
          {IS_LANGUAGE && (
            <button
              id="voicesBtn"
              title="Voices — choose which voice reads each language aloud"
              onClick={pick(props.onVoices)}
            >
              <span className="ico">
                <SpeakerIcon />
              </span>
              <span className="label">Voices</span>
            </button>
          )}
          {IS_LANGUAGE && (
            <button
              id="libraryBtn"
              title="Contents — every language pack this board can teach from"
              onClick={pick(props.onLibrary)}
            >
              <span className="ico">
                <ContentIcon />
              </span>
              <span className="label">Contents</span>
            </button>
          )}
          {IS_LANGUAGE && (
            <button
              id="contentBtn"
              title="Create content — write your own words, sentences & verbs pack"
              onClick={pick(props.onContent)}
            >
              <span className="ico">
                <PlusIcon />
              </span>
              <span className="label">Create content</span>
            </button>
          )}
          <button
            id="shortcutsBtn"
            title={`Keyboard shortcuts (${keyHint("help")})`}
            onClick={pick(props.onHelp)}
          >
            <span className="ico">
              <KeyboardIcon />
            </span>
            <span className="label">Keyboard shortcuts</span>
          </button>
          <button
            id="aboutBtn"
            title="About Maths Board — open source, privacy & licence"
            onClick={pick(props.onAbout)}
          >
            <span className="ico">
              <AboutIcon />
            </span>
            <span className="label">About &amp; credits</span>
          </button>
      </Popover>
    </>
  );
}
