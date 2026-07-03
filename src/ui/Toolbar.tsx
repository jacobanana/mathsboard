// The top toolbar. Deliberately STATIC: nothing appears, disappears or shifts
// when the tool or selection changes, so users always find buttons where they
// left them.
//
// Layout (left to right):
//   1. The five mode buttons — Select, Pan, Draw, Eraser, Text — icon-only,
//      selectable with keys 1-5 (wired in App). Select/Pan lead, matching the
//      Miro / Excalidraw convention (1 = select); Eraser sits next to Draw
//      since the two alternate constantly while working. The startup tool is
//      still the pen (order ≠ default).
//   2. The contextual options zone (OptionsStrip): a FIXED-WIDTH slot that
//      holds the size slider + colour dropdown for the active tool and simply
//      sits empty for Select/Pan — neighbouring buttons never move into it.
//   3. Insert, then Undo / Redo. Selection actions (edit / delete) are NOT on
//      the bar: they float next to the selection itself (FloatButtons), plus
//      the Delete key and double-click-to-edit.
//   4. Right side: the board-title chip, the live share status chip (only
//      while shared), and the burger menu (OverflowMenu) holding the
//      lesser-used actions — Join, Share, Paper, Boards, Save image.
//
// Everything that isn't pure store state is delegated to callbacks the host
// (App) wires.

import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { COLLAB_ENABLED } from "@/config";
import type { ToolName } from "@/board/types";
import { OptionsStrip } from "@/ui/OptionsStrip";
import { OverflowMenu } from "@/ui/OverflowMenu";
import { DrawIcon, TextIcon, EraserIcon, GLYPH } from "@/ui/icons";

export interface ToolbarCallbacks {
  onInsert: () => void;
  onBoards: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onSaveImage: () => void;
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
  const boardName = useBoardStore((s) => s.board.name);
  const sourceId = useBoardStore((s) => s.sourceId);
  const dirty = useBoardStore((s) => s.dirty);
  const collabMode = useCollabStore((s) => s.mode);
  const collabStatus = useCollabStore((s) => s.status);
  const peerCount = useCollabStore((s) => s.peers.length);

  const isMode = (t: ToolName) => tool === t;

  return (
    <div id="toolbar">
      {/* Icon-only: the title tooltips + aria-labels carry the names. */}
      <div className="group" id="modes">
        <button
          className={"btn small" + (isMode("select") ? " active" : "")}
          id="selectBtn"
          title="Select & move (1) — click a shape or drawing, drag empty space to lasso, Ctrl+A for all"
          aria-label="Select"
          onClick={() => setTool("select")}
        >
          <span className="ico">{GLYPH.select}</span>
        </button>
        <button
          className={"btn small" + (isMode("pan") ? " active" : "")}
          id="panBtn"
          title="Move the view (2)"
          aria-label="Pan"
          onClick={() => setTool("pan")}
        >
          <span className="ico">{GLYPH.pan}</span>
        </button>
        <button
          className={"btn small" + (isMode("pen") ? " active" : "")}
          id="drawBtn"
          title="Draw (3)"
          aria-label="Draw"
          onClick={() => setTool("pen")}
        >
          <span className="ico" id="drawIco">
            <DrawIcon />
          </span>
        </button>
        <button
          className={"btn small" + (isMode("eraser") ? " active" : "")}
          id="eraserBtn"
          title="Eraser (4)"
          aria-label="Eraser"
          onClick={() => setTool("eraser")}
        >
          <span className="ico" id="eraserIco">
            <EraserIcon />
          </span>
        </button>
        <button
          className={"btn small" + (isMode("text") ? " active" : "")}
          id="textBtn"
          title="Type text (5)"
          aria-label="Text"
          onClick={() => setTool("text")}
        >
          <span className="ico" id="textIco">
            <TextIcon />
          </span>
        </button>
      </div>

      <div className="divider" />

      <OptionsStrip />

      <div className="divider" />

      <button
        className="btn small insert"
        id="insertBtn"
        title="Insert a maths widget (I)"
        aria-label="Insert"
        onClick={props.onInsert}
      >
        <span className="ico">{GLYPH.insert}</span>
      </button>

      <div className="divider" />

      <button
        className="btn small"
        id="undoBtn"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={undo}
      >
        <span className="ico">{GLYPH.undo}</span>
      </button>
      <button
        className="btn small"
        id="redoBtn"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={redo}
      >
        <span className="ico">{GLYPH.redo}</span>
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
          and the label shows how many people are here. Collab builds only. */}
      {COLLAB_ENABLED && collabMode === "shared" && (
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
