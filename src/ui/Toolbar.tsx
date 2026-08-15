// The floating chrome over the full-bleed canvas. Two fixed layers instead of
// the old single top bar, so phones no longer wrap the toolbar into three rows:
//
//   #toolbar — a slim top strip of floating "islands":
//     left:  the board-title chip (tap -> boards manager);
//     right: Undo / Redo, the always-visible Share button (a plain "Share"
//            when solo, the live "N here" status chip while shared), then the
//            burger menu (OverflowMenu) with the lesser-used actions — Join,
//            Paper, Boards, Save image, Shortcuts.
//
//   #dock — a bottom-centre pill, thumb-reachable on touch devices, holding
//     the six mode buttons (Move, Select, Draw, Eraser, Text, Maths; keys 1-6)
//     plus Picture (7) and, past the divider, Insert (I / 0). Move (pan) leads
//     as the pure-navigation tool (1 = move), Select sits next to it; Eraser
//     sits next to Draw since the two alternate constantly; Maths sits next to
//     Text as its notation-aware sibling. The startup tool is still the pen
//     (order ≠ default). The LASER is not a dock button — it's a toggle on the
//     Select tool's options pill (and a second press of 2); see OptionsStrip.
//
//   The contextual options pill (OptionsStrip, #options) floats ABOVE the
//   dock when the active tool has options and disappears otherwise. It's a
//   separate layer, so the dock itself stays STATIC: buttons never move or
//   reflow when the tool changes — users always find them where they left
//   them. Pressing the ACTIVE tool's button folds the pill away and back
//   (dockPick), leaving every setting in it untouched — the draw pill's two
//   rows are a lot of a phone screen once you've picked your pen.
//
// Selection actions (edit / delete) are NOT here: they float next to the
// selection itself (FloatButtons), plus the Delete key and double-click-to-
// edit. Everything that isn't pure store state is delegated to callbacks the
// host (App) wires.

import { isSavedBoard, useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { COLLAB_ENABLED } from "@/config";
import { IS_LANGUAGE } from "@/subject";
import { PROFILE } from "@/boardProfile";
import { OptionsStrip } from "@/ui/OptionsStrip";
import { OverflowMenu } from "@/ui/OverflowMenu";
import { keyHint } from "@/ui/shortcuts";
import { dockPick, toolUiFor, type ToolUiSpec } from "@/ui/toolSpecs";
import { useUiStore } from "@/ui/uiStore";
import {
  ImageIcon,
  UndoIcon,
  RedoIcon,
  PlusIcon,
  ShareIcon,
  DiskIcon,
} from "@/ui/icons";

export interface ToolbarCallbacks {
  onInsert: () => void;
  /** Tap the board-title chip. Opens the launcher hub on the language board,
   *  the boards manager on the maths board. */
  onTitle: () => void;
  /** Quick-save the current board over its library entry (or Save as if it has
   *  never been saved). Mirrors Ctrl/Cmd+S. */
  onSave: () => void;
  onBoards: () => void;
  onPaper: (anchor: HTMLElement) => void;
  onSaveImage: () => void;
  /** Open the Share dialog (start sharing / code + link + who's here). */
  onShare: () => void;
  /** Open the Join dialog (enter a code someone shared). */
  onJoin: () => void;
  /** Insert a picture (opens the image tool's file-picker dialog directly). */
  onAddImage: () => void;
  /** Open the keyboard-shortcuts help sheet. */
  onHelp: () => void;
  /** Open the About & credits sheet (open source, privacy, licence). */
  onAbout: () => void;
  /** Open the content manager — what this board teaches, the library of loaded
   *  packs, and creating your own (language board only). */
  onContent: () => void;
  /** Open the text-to-speech voices settings (language board only). */
  onVoices: () => void;
}

// The dock's tools for THIS board flavour, resolved once from the profile's
// ordered list (src/boardProfile.ts). A tool absent here is absent from the dock
// AND from the keyboard (ui/shortcuts.ts reads the same list) — e.g. the maths-
// notation tool on the language board.
const DOCK_SPECS: ToolUiSpec[] = PROFILE.dockTools
  .map(toolUiFor)
  .filter((s): s is ToolUiSpec => s != null);

export function Toolbar(props: ToolbarCallbacks): JSX.Element {
  const tool = useBoardStore((s) => s.tool);
  const optionsOpen = useUiStore((s) => s.optionsOpen);
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

  // Show the board name whenever it's a saved board — a SHARED board is named
  // in the online store and every collaborator sees that name (even though they
  // have no local `sourceId` for it).
  const saved = isSavedBoard(sourceId, collabMode === "shared");

  return (
    <>
      {/* --- top strip: board meta + history + menu --------------------- */}
      <div id="toolbar">
        <div className="island">
          <button
            className="board-title"
            id="boardTitle"
            title={
              IS_LANGUAGE
                ? "New board, open one, or join with a code"
                : "Open the boards manager"
            }
            onClick={props.onTitle}
          >
            <span className="bt-name">
              {saved ? boardName : "Untitled draft"}
            </span>
            {dirty && <span className="bt-dot" title="Unsaved changes" />}
          </button>
          {/* Quick-save the board to the library, right where the name lives.
              A SHARED board persists online continuously and has no local save
              (the boards manager offers Rename instead), so this is solo-only.
              Disabled once everything's already saved — nothing to write. */}
          {collabMode !== "shared" && (
            <button
              className="btn small board-save"
              id="saveBoardBtn"
              title={`Save board (${keyHint("save")})`}
              aria-label="Save board"
              disabled={saved && !dirty}
              onClick={props.onSave}
            >
              <span className="ico">
                <DiskIcon />
              </span>
            </button>
          )}
        </div>

        <div className="island">
          <button
            className="btn small"
            id="undoBtn"
            title={`Undo (${keyHint("undo")})`}
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <span className="ico">
              <UndoIcon />
            </span>
          </button>
          <button
            className="btn small"
            id="redoBtn"
            title={`Redo (${keyHint("redo")})`}
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <span className="ico">
              <RedoIcon />
            </span>
          </button>
          {/* Share — always visible, sitting just left of the burger. While
              shared it's the live status chip: the dot mirrors the connection
              state and the label shows how many people are here. Solo, it's a
              plain Share button that opens the share dialog. Collab builds
              only. */}
          {COLLAB_ENABLED &&
            (collabMode === "shared" ? (
              <button
                className="btn keep-label sharing"
                id="shareBtn"
                title="Shared board — link, who's here, leave"
                onClick={props.onShare}
              >
                <span className={"status-dot status-" + collabStatus} />
                <span className="label">{peerCount + 1 + " here"}</span>
              </button>
            ) : (
              <button
                className="btn"
                id="shareBtn"
                title="Share this board with a link"
                aria-label="Share"
                onClick={props.onShare}
              >
                <span className="ico">
                  <ShareIcon />
                </span>
                <span className="label">Share</span>
              </button>
            ))}
          <OverflowMenu
            onJoin={props.onJoin}
            onPaper={props.onPaper}
            onBoards={props.onBoards}
            onSaveImage={props.onSaveImage}
            onHelp={props.onHelp}
            onAbout={props.onAbout}
            onContent={props.onContent}
            onVoices={props.onVoices}
          />
        </div>
      </div>

      {/* --- contextual options pill (floats above the dock) ------------ */}
      <OptionsStrip />

      {/* --- bottom dock: the tools --------------------------------------
          Icon-only (title tooltips + aria-labels carry the names), MAPPED
          from the TOOL_UI table — a new dock tool is a spec in
          ui/toolSpecs.tsx, not a hand-written button here. */}
      <nav id="dock" aria-label="Tools">
        <div className="island dock-inner">
          {DOCK_SPECS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.tool;
            return (
              <button
                key={t.tool}
                className={"btn small" + (active ? " active" : "")}
                id={t.domId}
                title={t.title(keyHint(t.shortcut.id))}
                aria-label={t.label}
                // The active tool's own button folds its options pill away and
                // back (dockPick, ui/toolSpecs.tsx) — announced here so the
                // pill's state is readable, not just visible.
                aria-expanded={active && t.Options ? optionsOpen : undefined}
                onClick={() => (t.pick ? t.pick() : dockPick(t.tool))}
              >
                <span className="ico">
                  <Icon />
                </span>
              </button>
            );
          })}

          {/* Picture insert — a first-class button since adding a photo or
              diagram is a common action (cf. Excalidraw/Miro). Sits with the
              content tools (after Maths, shortcut 7) rather than with Insert.
              Collab builds only: the image tool uploads through the backend,
              so the static single-user build neither registers the tool nor
              shows this. */}
          {COLLAB_ENABLED && (
            <button
              className="btn small"
              id="imageBtn"
              title={`Add a picture (${keyHint("image")})`}
              aria-label="Add a picture"
              onClick={props.onAddImage}
            >
              <span className="ico">
                <ImageIcon />
              </span>
            </button>
          )}

          <div className="divider" />

          <button
            className="btn small insert"
            id="insertBtn"
            title={`Insert a ${PROFILE.insertNoun} (${keyHint("insert")})`}
            aria-label="Insert"
            onClick={props.onInsert}
          >
            <span className="ico">
              <PlusIcon />
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
