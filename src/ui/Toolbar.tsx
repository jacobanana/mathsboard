// The top toolbar.
//
// Layout (left to right):
//   1. The five mode buttons — Draw, Eraser, Text, Select, Pan — selectable
//      with keys 1-5 (wired in App). Eraser sits next to Draw since the two
//      alternate constantly while working.
//   2. The contextual options strip (OptionsStrip): size slider + colour
//      dropdown for the active tool.
//   3. Insert, then the history/selection cluster (Undo, Redo, Edit, Delete).
//   4. Right side: the board-title chip, the live share status chip (only
//      while shared), and the burger menu (OverflowMenu) holding the
//      lesser-used actions — Join, Share, Paper, Boards, Save image.
//
// Everything that isn't pure store state is delegated to callbacks the host
// (App) wires.

import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import type { ToolName } from "@/board/types";
import { OptionsStrip } from "@/ui/OptionsStrip";
import { OverflowMenu } from "@/ui/OverflowMenu";
import { DrawIcon, TextIcon, EraserIcon, GLYPH } from "@/ui/icons";

export interface ToolbarCallbacks {
  onInsert: () => void;
  onBoards: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onSaveImage: () => void;
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
          title="Draw (1)"
          onClick={() => setTool("pen")}
        >
          <span className="ico" id="drawIco">
            <DrawIcon />
          </span>
          <span className="label">Draw</span>
        </button>
        <button
          className={"btn" + (isMode("eraser") ? " active" : "")}
          id="eraserBtn"
          title="Eraser (2)"
          onClick={() => setTool("eraser")}
        >
          <span className="ico" id="eraserIco">
            <EraserIcon />
          </span>
          <span className="label">Eraser</span>
        </button>
        <button
          className={"btn" + (isMode("text") ? " active" : "")}
          id="textBtn"
          title="Type text (3)"
          onClick={() => setTool("text")}
        >
          <span className="ico" id="textIco">
            <TextIcon />
          </span>
          <span className="label">Text</span>
        </button>
        <button
          className={"btn" + (isMode("select") ? " active" : "")}
          id="selectBtn"
          title="Select & move (4) — click a shape or drawing, drag empty space to lasso, Ctrl+A for all"
          onClick={() => setTool("select")}
        >
          <span className="ico">{GLYPH.select}</span>
          <span className="label">Select</span>
        </button>
        <button
          className={"btn" + (isMode("pan") ? " active" : "")}
          id="panBtn"
          title="Move the view (5)"
          onClick={() => setTool("pan")}
        >
          <span className="ico">{GLYPH.pan}</span>
          <span className="label">Pan</span>
        </button>
      </div>

      <div className="divider" />

      <OptionsStrip />

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
        className="btn"
        id="undoBtn"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={undo}
      >
        <span className="ico">{GLYPH.undo}</span>
        <span className="label">Undo</span>
      </button>
      <button
        className="btn"
        id="redoBtn"
        title="Redo (Ctrl+Shift+Z)"
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

      <button
        className="board-title"
        id="boardTitle"
        title="Open the boards manager"
        onClick={props.onBoards}
      >
        <span className="bt-name">{sourceId ? boardName : "Untitled draft"}</span>
        {dirty && <span className="bt-dot" title="Unsaved changes" />}
      </button>

      {/* Live share status chip — only while in a shared session (otherwise
          Share lives in the burger menu). The dot mirrors the connection state
          and the label shows how many people are here. */}
      {collabMode === "shared" && (
        <button
          className="btn keep-label sharing"
          id="shareBtn"
          title="Shared board — link, who's here, leave"
          onClick={props.onShare}
        >
          <span className={"status-dot status-" + collabStatus} />
          <span className="label">{peerCount + 1 + " here"}</span>
        </button>
      )}

      <OverflowMenu
        onJoin={props.onJoin}
        onShare={props.onShare}
        onPaper={props.onPaper}
        onBoards={props.onBoards}
        onSaveImage={props.onSaveImage}
      />
    </div>
  );
}
