// The top toolbar. Ported from the prototype markup (lines 89-111) and its
// wiring (setTool line 192-194, undo/redo/delete/edit line 338-339).
//
// Mode buttons (Draw / Text / Select / Pan / Eraser) reflect store.tool via the
// .active class and call setTool. The #options group is rendered as a separate
// component (OptionsStrip) and slotted between the dividers, matching the
// prototype's <div class="group" id="options"></div>.
//
// Everything that isn't pure store state (Insert, Paper, Save image, Help, Edit
// selected) is delegated to callbacks the host (App) wires.

import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import type { ToolName } from "@/board/types";
import { OptionsStrip } from "@/ui/OptionsStrip";
import { DrawIcon, TextIcon, EraserIcon, GLYPH } from "@/ui/icons";

export interface ToolbarCallbacks {
  onInsert: () => void;
  onBoards: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onSaveImage: () => void;
  onHelp: () => void;
  onEditSelected: () => void;
  /** Open the Share dialog (start sharing / code + link + who's here). */
  onShare: () => void;
  /** Open the Join dialog (enter a code someone shared). */
  onJoin: () => void;
}

export function Toolbar(props: ToolbarCallbacks): JSX.Element {
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const undo = useBoardStore((s) => s.undo);
  const redo = useBoardStore((s) => s.redo);
  const canUndo = useBoardStore((s) => s.canUndo);
  const canRedo = useBoardStore((s) => s.canRedo);
  const selection = useBoardStore((s) => s.selection);
  const deleteSelection = useBoardStore((s) => s.deleteSelection);
  const boardName = useBoardStore((s) => s.board.name);
  const sourceId = useBoardStore((s) => s.sourceId);
  const dirty = useBoardStore((s) => s.dirty);
  const collabMode = useCollabStore((s) => s.mode);
  const collabStatus = useCollabStore((s) => s.status);
  const peerCount = useCollabStore((s) => s.peers.length);

  const isMode = (t: ToolName) => tool === t;
  const selCount = selection.objectIds.length + selection.strokeIds.length;
  const hasSelection = selCount > 0;
  // Editing settings only makes sense for a single placed object (not a stroke).
  const canEdit = selection.objectIds.length === 1 && selection.strokeIds.length === 0;

  return (
    <div id="toolbar">
      <div className="group" id="modes">
        <button
          className={"btn" + (isMode("pen") ? " active" : "")}
          id="drawBtn"
          title="Draw"
          onClick={() => setTool("pen")}
        >
          <span className="ico" id="drawIco">
            <DrawIcon />
          </span>
          <span className="label">Draw</span>
        </button>
        <button
          className={"btn" + (isMode("text") ? " active" : "")}
          id="textBtn"
          title="Type text"
          onClick={() => setTool("text")}
        >
          <span className="ico" id="textIco">
            <TextIcon />
          </span>
          <span className="label">Text</span>
        </button>
      </div>

      <div className="divider" />

      <OptionsStrip />

      <div className="divider" />

      <button
        className={"btn" + (isMode("select") ? " active" : "")}
        id="selectBtn"
        title="Select & move — click a shape or drawing, drag empty space to lasso, Ctrl+A for all"
        onClick={() => setTool("select")}
      >
        <span className="ico">{GLYPH.select}</span>
        <span className="label">Select</span>
      </button>
      <button
        className={"btn" + (isMode("pan") ? " active" : "")}
        id="panBtn"
        title="Move the view"
        onClick={() => setTool("pan")}
      >
        <span className="ico">{GLYPH.pan}</span>
        <span className="label">Pan</span>
      </button>
      <button
        className={"btn" + (isMode("eraser") ? " active" : "")}
        id="eraserBtn"
        title="Eraser"
        onClick={() => setTool("eraser")}
      >
        <span className="ico" id="eraserIco">
          <EraserIcon />
        </span>
        <span className="label">Eraser</span>
      </button>

      <div className="divider" />

      <button
        className="btn insert keep-label"
        id="insertBtn"
        onClick={props.onInsert}
      >
        <span className="ico">{GLYPH.insert}</span>
        <span className="label">Insert</span>
      </button>

      <div className="divider" />

      <button
        className="btn keep-label"
        id="boardsBtn"
        title="Boards — save, open, rename & delete whiteboards (Ctrl+S save · Ctrl+Shift+S save as)"
        onClick={props.onBoards}
      >
        <span className="ico">{GLYPH.boards}</span>
        <span className="label">Boards</span>
      </button>
      <button
        className="board-title"
        id="boardTitle"
        title="Open the boards manager"
        onClick={props.onBoards}
      >
        <span className="bt-name">{sourceId ? boardName : "Untitled draft"}</span>
        {dirty && <span className="bt-dot" title="Unsaved changes" />}
      </button>

      <div className="divider" />

      <button
        className="btn"
        id="paperBtn"
        onClick={(e) => props.onPaper(e.currentTarget)}
      >
        <span className="ico">{GLYPH.paper}</span>
        <span className="label">Paper</span>
      </button>
      <button
        className="btn"
        id="undoBtn"
        disabled={!canUndo}
        onClick={undo}
      >
        <span className="ico">{GLYPH.undo}</span>
        <span className="label">Undo</span>
      </button>
      <button
        className="btn"
        id="redoBtn"
        disabled={!canRedo}
        onClick={redo}
      >
        <span className="ico">{GLYPH.redo}</span>
        <span className="label">Redo</span>
      </button>
      <button
        className="btn"
        id="editObjBtn"
        title="Edit selected object"
        disabled={!canEdit}
        onClick={props.onEditSelected}
      >
        <span className="ico" id="editIco">
          <DrawIcon />
        </span>
        <span className="label">Edit</span>
      </button>
      <button
        className="btn"
        id="deleteObjBtn"
        title="Delete selection"
        disabled={!hasSelection}
        onClick={() => deleteSelection()}
      >
        <span className="ico">{GLYPH.delete}</span>
        <span className="label">Delete</span>
      </button>

      <div className="spacer" />

      {/* Join a shared board by code. Hidden while already in a shared
          session (the Share button carries the live status then). */}
      {collabMode !== "shared" && (
        <button
          className="btn keep-label"
          id="joinBtn"
          title="Join a board someone shared — enter their code"
          onClick={props.onJoin}
        >
          <span className="ico">{GLYPH.join}</span>
          <span className="label">Join</span>
        </button>
      )}

      {/* Share / live-session status. In a shared session the dot mirrors the
          connection state and the label shows how many people are here. */}
      <button
        className={
          "btn keep-label" + (collabMode === "shared" ? " sharing" : "")
        }
        id="shareBtn"
        title={
          collabMode === "shared"
            ? "Shared board — link, who's here, leave"
            : "Share this board with a link"
        }
        onClick={props.onShare}
      >
        {collabMode === "shared" ? (
          <span className={"status-dot status-" + collabStatus} />
        ) : (
          <span className="ico">{GLYPH.share}</span>
        )}
        <span className="label">
          {collabMode === "shared"
            ? peerCount + 1 + " here"
            : "Share"}
        </span>
      </button>

      <button
        className="btn keep-label"
        id="saveBtn"
        onClick={props.onSaveImage}
      >
        <span className="ico">{GLYPH.save}</span>
        <span className="label">Save image</span>
      </button>
      <button className="btn keep-label" id="helpBtn" onClick={props.onHelp}>
        <span className="ico">{GLYPH.help}</span>
        <span className="label">Help</span>
      </button>
    </div>
  );
}
