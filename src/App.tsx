// The application shell. Owns the #stage viewport and composes the toolbar, the
// board canvas (two <canvas> layers + in-place text editor), the interactive
// widget overlay, the zoom cluster, the floating edit/delete buttons, and all
// menus/modals. It owns the modal routing + object placement/editing wiring
// described in the foundation contract (section 5 + the host-wiring notes).
//
// Ported from the prototype's host glue: addObject/editObject/place
// (lines 351-353), openEditFor (line 354), insertGallery (357-387), the paper
// menu (342-345), save image (606), help (608-613), and init (615).
//
// ---------------------------------------------------------------------------
// CONTRACT this shell relies on / exposes:
//
//   BoardCanvas (src/canvas/BoardCanvas) renders #stage with the "template" and
//   "ink" canvases, the widget layer and the text editor, and drives all
//   pointer interaction against the store. It takes ONE prop:
//     onEditObject(obj) -> open that object's settings Dialog (EDIT flow).
//   It is fired on double-click of a canvas object and from the float edit
//   button. Free-text objects are edited in place and never reach this.
//
//   Object placement is owned HERE, not by tools/canvas:
//     - CREATE: host computes size via tool.size(params), builds
//       obj = { id: id(), type, x, y, w, h, ...params } centred on screen
//       (screenToWorld(W/2, H/2) + cascade), then addObject + select +
//       setTool("select").
//     - EDIT: host recomputes size and calls updateObject(id, {...params,w,h}),
//       keeping selection.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { BoardCanvas } from "@/canvas/BoardCanvas";
import { WidgetLayer } from "@/canvas/WidgetLayer";
import { PresenceLayer } from "@/ui/PresenceLayer";
import { ShareModal } from "@/ui/ShareModal";
import { WelcomeModal } from "@/ui/WelcomeModal";
import { JoinForm } from "@/ui/JoinForm";
import { boardIdFromUrl } from "@/collab/session";
import { getStoredName, setStoredName } from "@/collab/profile";
import { Toolbar } from "@/ui/Toolbar";
import { FloatButtons } from "@/ui/FloatButtons";
import { ZoomCluster } from "@/ui/ZoomCluster";
import { Modal } from "@/ui/Modal";
import { InsertGallery } from "@/ui/InsertGallery";
import { PaperMenu } from "@/ui/PaperMenu";
import { BoardsManager } from "@/ui/BoardsManager";
import { NamePrompt } from "@/ui/NamePrompt";
import { useImageDrop } from "@/ui/useImageDrop";
import { useBoardStore, activeTextObjectId } from "@/board/store";
import { useUiStore } from "@/ui/uiStore";
import { screenToWorld } from "@/board/geometry";
import { COLLAB_ENABLED } from "@/config";
import { getTool } from "@/tools/registry";
import { id as makeId } from "@/board/types";
import { theme } from "@/styles/theme";
import { textSizeOf } from "@/canvas/drawHelpers";
import {
  PALETTE,
  PEN_SIZE_RANGE,
  TEXT_SIZE_RANGE,
  ERASER_SIZE_RANGE,
} from "@/ui/constants";
import type { AnyBoardObject, Stroke } from "@/board/types";
import type { CanvasTool, WidgetTool } from "@/tools/registry";

// --- modal routing ---------------------------------------------------------

type ModalState =
  | { kind: "welcome" }
  | { kind: "insert" }
  | { kind: "dialog"; toolType: string; objId?: string; initial?: Record<string, unknown> }
  | { kind: "boards" }
  | { kind: "saveAs"; initial: string }
  | { kind: "share" }
  | { kind: "join" }
  | { kind: "joinName" }
  | null;

/** Pull the registered tool's size for given params (canvas: size(p); widget: fixed). */
function toolSize(
  type: string,
  params: Record<string, unknown>,
): { w: number; h: number } | null {
  const tool = getTool(type);
  if (!tool) return null;
  return tool.kind === "canvas"
    ? (tool as CanvasTool).size(params)
    : (tool as WidgetTool).defaultSize;
}

/** Strip the geometric base fields, leaving only a tool's own params. */
function paramsOf(obj: AnyBoardObject): Record<string, unknown> {
  const { id, type, x, y, w, h, ...params } = obj;
  void id;
  void type;
  void x;
  void y;
  void w;
  void h;
  return params;
}

/** Cycle the draw colour to the next palette entry (C). Also recolours a live
 *  text object, matching a swatch click. */
function cycleColor(): void {
  const st = useBoardStore.getState();
  const idx = PALETTE.findIndex(([, hex]) => hex === st.color);
  const [, next] = PALETTE[(idx + 1) % PALETTE.length];
  st.setColor(next);
  const tid = activeTextObjectId(st);
  if (tid != null) st.updateObject(tid, { color: next });
}

/** Nudge the active tool's size one step (+/-), clamped to that tool's range.
 *  No-op unless a size-bearing tool (pen / eraser / text) is active. */
function adjustSize(dir: 1 | -1): void {
  const st = useBoardStore.getState();
  const conf =
    st.tool === "pen"
      ? { range: PEN_SIZE_RANGE, cur: st.penSize, set: st.setPenSize }
      : st.tool === "eraser"
        ? { range: ERASER_SIZE_RANGE, cur: st.eraserSize, set: st.setEraserSize }
        : st.tool === "text"
          ? { range: TEXT_SIZE_RANGE, cur: st.textSize, set: st.setTextSize }
          : null;
  if (!conf) return;
  const next = Math.min(
    conf.range.max,
    Math.max(conf.range.min, conf.cur + dir * conf.range.step),
  );
  if (next === conf.cur) return;
  conf.set(next);
  // Text: re-measure the live object so its box tracks the new size.
  if (st.tool === "text") {
    const tid = activeTextObjectId(st);
    if (tid != null) {
      const obj = st.board.objects.find((o) => o.id === tid);
      const text = (obj?.text as string) ?? "";
      const { w, h } = textSizeOf(text, next);
      st.updateObject(tid, { size: next, w, h });
    }
  }
}

// --- copy / cut / paste / duplicate --------------------------------------
// An INTERNAL clipboard (not the OS clipboard): Ctrl+C/X snapshot the selected
// shapes here, Ctrl+V / Ctrl+D re-insert clones with fresh ids and a cascading
// offset. Matches how Excalidraw/Miro handle in-app copy.

type ShapeBag = { objects: AnyBoardObject[]; strokes: Stroke[] };

/** World-px offset applied to each paste/duplicate so a copy doesn't land
 *  exactly on top of its source. */
const PASTE_OFFSET = 24;

let clipboard: ShapeBag | null = null;
// How many times the CURRENT clipboard has been pasted, so repeated pastes
// cascade instead of stacking. Reset on every copy/cut.
let pasteSeq = 0;

/** The selected objects + strokes, resolved to their document shapes. */
function selectedShapes(): ShapeBag {
  const st = useBoardStore.getState();
  const objects = st.selection.objectIds
    .map((id) => st.board.objects.find((o) => o.id === id))
    .filter((o): o is AnyBoardObject => o != null);
  const strokes = st.selection.strokeIds
    .map((id) => st.board.strokes.find((s) => s.id === id))
    .filter((s): s is Stroke => s != null);
  return { objects, strokes };
}

/** Deep-clone shapes with fresh ids and a world offset; strips `order` so the
 *  batch re-inserts on top (insertShapes assigns fresh order keys). */
function cloneShapes(src: ShapeBag, dx: number, dy: number): ShapeBag {
  const objects = src.objects.map((o) => {
    const { order, ...rest } = structuredClone(o);
    void order;
    return { ...rest, id: makeId(), x: o.x + dx, y: o.y + dy };
  });
  const strokes = src.strokes.map((s) => {
    const { order, ...rest } = structuredClone(s);
    void order;
    return {
      ...rest,
      id: makeId(),
      points: rest.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  });
  return { objects, strokes };
}

/** Insert a clone batch, then select it and switch to the select tool so the
 *  fresh copy can be moved immediately (mirrors placeNew). */
function placeClones(batch: ShapeBag): void {
  if (batch.objects.length === 0 && batch.strokes.length === 0) return;
  const st = useBoardStore.getState();
  st.addShapes(batch.objects, batch.strokes);
  st.setSelection({
    objectIds: batch.objects.map((o) => o.id),
    strokeIds: batch.strokes.map((s) => s.id),
  });
  st.setTool("select");
}

function copySelection(): void {
  const sel = selectedShapes();
  if (sel.objects.length === 0 && sel.strokes.length === 0) return;
  clipboard = {
    objects: sel.objects.map((o) => structuredClone(o)),
    strokes: sel.strokes.map((s) => structuredClone(s)),
  };
  pasteSeq = 0;
}

function pasteClipboard(): void {
  if (!clipboard) return;
  pasteSeq += 1;
  const d = PASTE_OFFSET * pasteSeq;
  placeClones(cloneShapes(clipboard, d, d));
}

function duplicateSelection(): void {
  const sel = selectedShapes();
  placeClones(cloneShapes(sel, PASTE_OFFSET, PASTE_OFFSET));
}

export default function App(): JSX.Element {
  const init = useBoardStore((s) => s.init);
  const addObject = useBoardStore((s) => s.addObject);
  const updateObject = useBoardStore((s) => s.updateObject);
  const select = useBoardStore((s) => s.select);
  const setTool = useBoardStore((s) => s.setTool);

  const [modal, setModal] = useState<ModalState>(null);
  const [paperAnchor, setPaperAnchor] = useState<HTMLElement | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of the last arrow-key nudge, so a held/rapid burst collapses into
  // one undo step while a fresh press after a pause starts a new one.
  const nudgeAtRef = useRef(0);
  // The #stage element (owned by App) FloatButtons portals into and ZoomCluster
  // measures. Captured via a callback ref so it's available on first commit.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const setStageRef = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    setStageEl(el);
  }, []);
  const getStageSize = useCallback(() => {
    const r = stageRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  }, []);

  // Load (or create) the current board once on mount.
  //   - Share link (?board=<id>): join directly, asking for a display name
  //     FIRST if none is stored — init() then joins the shared board with it.
  //   - Plain load: show the WELCOME screen while init() loads the draft
  //     behind it. Continue just closes it; Join / New / Open replace the
  //     draft from inside the modal.
  useEffect(() => {
    if (boardIdFromUrl()) {
      if (!getStoredName()) {
        setModal({ kind: "joinName" });
        return; // init() runs from the prompt's onSubmit
      }
      void init();
      return;
    }
    setModal({ kind: "welcome" });
    void init();
  }, [init]);

  const handleJoinName = useCallback(
    (name: string) => {
      setStoredName(name);
      setModal(null);
      void init();
    },
    [init],
  );

  const closeModal = useCallback(() => setModal(null), []);

  // --- Save board (draft -> library) --------------------------------------
  // Briefly show a "Saved" confirmation after a successful explicit save.
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1400);
  }, []);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  // Ctrl/Cmd+S: save over the linked library board. A never-saved draft has no
  // linked board, so fall back to Save as (prompt for a name).
  const doSave = useCallback(async () => {
    const { needsName } = await useBoardStore.getState().saveCurrent();
    if (needsName) {
      setModal({ kind: "saveAs", initial: "" });
    } else {
      flashSaved();
    }
  }, [flashSaved]);

  // Ctrl/Cmd+Shift+S: always save as a new named board.
  const doSaveAs = useCallback(() => {
    const { board, sourceId } = useBoardStore.getState();
    setModal({ kind: "saveAs", initial: sourceId ? board.name : "" });
  }, []);

  const handleSaveAsSubmit = useCallback(
    async (name: string) => {
      await useBoardStore.getState().saveAs(name);
      setModal(null);
      flashSaved();
    },
    [flashSaved],
  );

  // --- placement (CREATE) --------------------------------------------------
  // Ports prototype addObject (line 351): centre on screen, cascade 22px per
  // object (mod 6) so successive inserts fan out instead of stacking. `at`
  // (screen px relative to #stage) overrides the centre for drag-dropped
  // images so they land under the cursor; a dropped object skips the cascade.
  const placeNew = useCallback(
    (
      toolType: string,
      params: Record<string, unknown>,
      at?: { x: number; y: number },
    ) => {
      const size = toolSize(toolType, params);
      if (!size) return;
      const { camera, board } = useBoardStore.getState();
      const r = document.getElementById("stage")?.getBoundingClientRect();
      const W = r?.width ?? 0;
      const H = r?.height ?? 0;
      const anchor = screenToWorld(camera, at ? at.x : W / 2, at ? at.y : H / 2);
      const casc = at ? 0 : (board.objects.length % 6) * 22;
      const obj: AnyBoardObject = {
        id: makeId(),
        type: toolType,
        x: anchor.x - size.w / 2 + casc,
        y: anchor.y - size.h / 2 + casc,
        w: size.w,
        h: size.h,
        ...params,
      };
      addObject(obj);
      select(obj.id);
      setTool("select");
    },
    [addObject, select, setTool],
  );

  // Drag-and-drop an image file onto the board: uploads via the same backend
  // path as the Picture dialog, then places it at the drop point. Wired to
  // #stage only in collab builds (COLLAB_ENABLED) — the backend does the upload.
  const imageDrop = useImageDrop(
    useCallback(
      (image, at) => placeNew("image", { ...image }, at),
      [placeNew],
    ),
  );

  // --- editing (EDIT) ------------------------------------------------------
  // Ports prototype editObject (line 352): keep position, recompute size.
  const applyEdit = useCallback(
    (objId: string, params: Record<string, unknown>) => {
      const existing = useBoardStore
        .getState()
        .board.objects.find((o) => o.id === objId);
      if (!existing) return;
      // Preserve any uniform resize: derive the current scale from the stored box
      // vs. the natural size for the OLD params, then re-apply it to the new
      // natural size so editing settings doesn't snap the widget back to 1x.
      const oldNat = toolSize(existing.type, paramsOf(existing));
      const scale = oldNat && oldNat.w > 0 ? existing.w / oldNat.w : 1;
      const size = toolSize(existing.type, params);
      if (!size) return;
      updateObject(objId, { ...params, w: size.w * scale, h: size.h * scale });
    },
    [updateObject],
  );

  // --- open the settings Dialog for an existing object (EDIT) -------------
  // Shared by the toolbar Edit button, the float edit button, and BoardCanvas's
  // onEditObject (double-click). Tools without a Dialog (free text) are edited
  // in place by BoardCanvas and never routed here.
  const openEditFor = useCallback((obj: AnyBoardObject) => {
    const tool = getTool(obj.type);
    if (!tool || !tool.Dialog) return;
    setModal({
      kind: "dialog",
      toolType: obj.type,
      objId: obj.id,
      initial: paramsOf(obj),
    });
  }, []);

  // Float-button "edit selected": resolve the selection, then route. Editing
  // applies to exactly one object (a stroke or multi-select has no settings
  // dialog).
  const editSelected = useCallback(() => {
    const { selection, board } = useBoardStore.getState();
    if (selection.strokeIds.length > 0 || selection.objectIds.length !== 1) return;
    const o = board.objects.find((x) => x.id === selection.objectIds[0]);
    if (o) openEditFor(o);
  }, [openEditFor]);

  // --- dialog submit routing ----------------------------------------------
  const handleDialogSubmit = useCallback(
    (params: Record<string, unknown>) => {
      if (modal?.kind !== "dialog") return;
      if (modal.objId != null) applyEdit(modal.objId, params);
      else placeNew(modal.toolType, params);
      setModal(null);
    },
    [modal, applyEdit, placeNew],
  );

  // --- Insert gallery: a tile was picked ----------------------------------
  const handlePick = useCallback(
    (toolType: string) => {
      const tool = getTool(toolType);
      if (!tool) return;
      if (tool.Dialog) {
        setModal({ kind: "dialog", toolType }); // CREATE mode
      } else {
        placeNew(toolType, tool.defaults());
        setModal(null);
      }
    },
    [placeNew],
  );

  // --- Save image ----------------------------------------------------------
  // Ports prototype save (line 606): composite the two stacked canvases onto a
  // paper-filled buffer and download as PNG.
  const saveImage = useCallback(() => {
    const tCanvas = document.querySelector<HTMLCanvasElement>("#stage #template");
    const iCanvas = document.querySelector<HTMLCanvasElement>("#stage #ink");
    if (!tCanvas || !iCanvas) return;
    const out = document.createElement("canvas");
    out.width = tCanvas.width;
    out.height = tCanvas.height;
    const o = out.getContext("2d");
    if (!o) return;
    o.fillStyle = theme.paper;
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(tCanvas, 0, 0);
    o.drawImage(iCanvas, 0, 0);
    const a = document.createElement("a");
    a.download = "maths-board-" + new Date().toISOString().slice(0, 10) + ".png";
    a.href = out.toDataURL("image/png");
    a.click();
  }, []);

  // --- global keyboard shortcuts (port of prototype line 340) --------------
  // Delete/Backspace removes the whole selection (objects + strokes); Ctrl/Cmd+A
  // selects everything; Ctrl/Cmd+C / X / V copy / cut / paste the selection;
  // Ctrl/Cmd+D duplicates it; arrow keys nudge it (Shift = bigger); Escape
  // clears the selection; Ctrl/Cmd+Z undoes, +Shift redoes; 1-5 pick a tool
  // (toolbar order); I / 6 open the Insert gallery; C cycles the draw colour;
  // +/- resize the active tool. Suppressed while any modal is open or a text
  // object is being edited in place (textarea/worksheet inputs stopPropagation
  // on their own keys).
  useEffect(() => {
    // 1-5 mirror the toolbar's button order.
    const TOOL_KEYS = ["select", "pan", "pen", "eraser", "text"] as const;
    const onKey = (e: KeyboardEvent) => {
      const st = useBoardStore.getState();
      // Save shortcuts work even while editing text, but defer to any open
      // dialog (its own buttons own Enter/Escape).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (useUiStore.getState().modalOpen) return;
        e.preventDefault();
        if (e.shiftKey) doSaveAs();
        else void doSave();
        return;
      }
      if (useUiStore.getState().modalOpen || st.editingId != null) return;
      const hasSelection =
        st.selection.objectIds.length + st.selection.strokeIds.length > 0;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // Focus in a real field (widget answer boxes, join-code input, ...): let
      // native editing + copy/paste through; only stopPropagation-less inputs
      // reach here, but guard anyway.
      const inField =
        (e.target as HTMLElement | null)?.closest(
          "input,textarea,select,[contenteditable]",
        ) != null;

      if ((e.key === "Delete" || e.key === "Backspace") && hasSelection) {
        e.preventDefault();
        st.deleteSelection();
      } else if (mod && key === "a") {
        e.preventDefault();
        st.setTool("select");
        st.selectAll();
      } else if (mod && key === "c" && hasSelection && !inField) {
        e.preventDefault();
        copySelection();
      } else if (mod && key === "x" && hasSelection && !inField) {
        e.preventDefault();
        copySelection();
        st.deleteSelection();
      } else if (mod && key === "v" && !inField) {
        e.preventDefault();
        pasteClipboard();
      } else if (mod && key === "d" && hasSelection && !inField) {
        e.preventDefault();
        duplicateSelection();
      } else if (e.key === "Escape" && hasSelection) {
        e.preventDefault();
        st.clearSelection();
      } else if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (
        !mod &&
        !e.altKey &&
        e.key.startsWith("Arrow") &&
        hasSelection &&
        !inField
      ) {
        // Nudge the selection; Shift = a bigger step, held constant in screen px
        // regardless of zoom. captureTimeout is Infinity, so a fresh press after
        // a >500ms pause starts a new undo step; a burst merges into one.
        e.preventDefault();
        const px = (e.shiftKey ? 10 : 1) / st.camera.scale;
        const dx = e.key === "ArrowLeft" ? -px : e.key === "ArrowRight" ? px : 0;
        const dy = e.key === "ArrowUp" ? -px : e.key === "ArrowDown" ? px : 0;
        const now = Date.now();
        if (now - nudgeAtRef.current > 500) st.pushHistory();
        nudgeAtRef.current = now;
        st.nudgeSelection(dx, dy);
      } else if (!mod && !e.altKey && !inField) {
        // Bare-key shortcuts: 1-5 pick a tool, I / 6 open the Insert gallery
        // (6 continues the toolbar's number row), C cycles colour, +/- resize.
        if (e.key >= "1" && e.key <= String(TOOL_KEYS.length)) {
          e.preventDefault();
          st.setTool(TOOL_KEYS[Number(e.key) - 1]);
        } else if (key === "i" || e.key === "6") {
          e.preventDefault();
          setModal({ kind: "insert" });
        } else if (key === "c") {
          e.preventDefault();
          cycleColor();
        } else if (e.key === "+" || e.key === "=") {
          // Accept "=" so the +/= key works without Shift.
          e.preventDefault();
          adjustSize(1);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          adjustSize(-1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave, doSaveAs]);

  // --- the open tool Dialog (create or edit), resolved from the registry ---
  let dialogNode: JSX.Element | null = null;
  if (modal?.kind === "dialog") {
    const tool = getTool(modal.toolType);
    const Dialog = tool?.Dialog;
    if (Dialog) {
      const editing = modal.objId != null;
      // CREATE cancel returns to the gallery — but only for tools that live in
      // it. A tool opened from a dedicated entry point (e.g. the Picture
      // button, inGallery:false) has nowhere to go back to, so cancel closes.
      // EDIT cancel always just closes.
      const backToGallery = !editing && tool?.inGallery !== false;
      dialogNode = (
        <Dialog
          initial={modal.initial as never}
          onSubmit={handleDialogSubmit as never}
          onCancel={backToGallery ? () => setModal({ kind: "insert" }) : closeModal}
        />
      );
    }
  }

  return (
    <>
      <Toolbar
        onInsert={() => setModal({ kind: "insert" })}
        onBoards={() => setModal({ kind: "boards" })}
        onPaper={(anchor) => setPaperAnchor(anchor)}
        onSaveImage={saveImage}
        onShare={() => setModal({ kind: "share" })}
        onJoin={() => setModal({ kind: "join" })}
        onAddImage={() => handlePick("image")}
      />

      {/* #stage is the positioned board viewport. It holds the two stacked
          canvases + in-place text editor (BoardCanvas), the interactive widget
          overlay (WidgetLayer), and the zoom cluster. FloatButtons portals in. */}
      <div
        id="stage"
        ref={setStageRef}
        className={COLLAB_ENABLED && imageDrop.active ? "stage-dropping" : undefined}
        {...(COLLAB_ENABLED ? imageDrop.handlers : {})}
      >
        <BoardCanvas onEditObject={openEditFor} />
        <WidgetLayer onEditObject={openEditFor} />
        {COLLAB_ENABLED && <PresenceLayer />}
        <ZoomCluster getStageSize={getStageSize} />
        {COLLAB_ENABLED && imageDrop.active && (
          <div className="drop-overlay" aria-hidden>
            <span className="drop-hint">Drop image to add it</span>
          </div>
        )}
      </div>

      {/* Float edit/delete buttons portal into #stage (positioned absolute). */}
      <FloatButtons container={stageEl} onEditSelected={editSelected} />

      <PaperMenu anchor={paperAnchor} onClose={() => setPaperAnchor(null)} />

      {/* Welcome screen (plain loads only; share links join directly). Closing
          it any way — Continue, backdrop, Escape — resumes the draft. */}
      <Modal open={modal?.kind === "welcome"} onClose={closeModal}>
        {modal?.kind === "welcome" && (
          <WelcomeModal
            onClose={closeModal}
            onOpenBoards={() => setModal({ kind: "boards" })}
          />
        )}
      </Modal>

      {/* Mid-session "Join a board" (toolbar Join button). Collab builds only. */}
      <Modal open={COLLAB_ENABLED && modal?.kind === "join"} onClose={closeModal}>
        {COLLAB_ENABLED && modal?.kind === "join" && (
          <>
            <h2>Join a board</h2>
            <p className="hint">
              Type the code you were given, or paste the link. Your current
              drawing stays saved as your own draft.
            </p>
            <JoinForm autoFocus onJoined={closeModal} />
            <div className="card-actions">
              <button className="btn" onClick={closeModal}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={modal?.kind === "insert"} onClose={closeModal}>
        <InsertGallery onPick={handlePick} />
      </Modal>

      <Modal open={modal?.kind === "dialog"} onClose={closeModal}>
        {dialogNode}
      </Modal>

      <Modal open={modal?.kind === "boards"} onClose={closeModal}>
        <BoardsManager onClose={closeModal} />
      </Modal>

      <Modal open={modal?.kind === "saveAs"} onClose={closeModal}>
        {modal?.kind === "saveAs" && (
          <NamePrompt
            title="Save board as"
            initial={modal.initial}
            confirmLabel="Save"
            onSubmit={handleSaveAsSubmit}
            onCancel={closeModal}
          />
        )}
      </Modal>

      <Modal open={COLLAB_ENABLED && modal?.kind === "share"} onClose={closeModal}>
        {COLLAB_ENABLED && modal?.kind === "share" && (
          <ShareModal onClose={closeModal} />
        )}
      </Modal>

      {/* Joining a shared link: ask for a display name, then join. Closing the
          prompt joins as "Guest" rather than stranding the user on a blank app.
          Collab builds only — plain loads never reach the joinName modal since
          boardIdFromUrl() returns null when collaboration is compiled out. */}
      <Modal
        open={COLLAB_ENABLED && modal?.kind === "joinName"}
        onClose={() => handleJoinName("Guest")}
      >
        {COLLAB_ENABLED && modal?.kind === "joinName" && (
          <NamePrompt
            title="Joining a shared board — what's your name?"
            confirmLabel="Join"
            onSubmit={handleJoinName}
            onCancel={() => handleJoinName("Guest")}
          />
        )}
      </Modal>

      {COLLAB_ENABLED && imageDrop.error && (
        <div id="dropError" role="alert">
          {imageDrop.error}
        </div>
      )}

      {savedFlash && (
        <div id="savedToast" role="status">
          Saved ✓
        </div>
      )}
    </>
  );
}
