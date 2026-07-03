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
import { boardIdFromUrl } from "@/collab/session";
import { getStoredName, setStoredName } from "@/collab/profile";
import { Toolbar } from "@/ui/Toolbar";
import { FloatButtons } from "@/ui/FloatButtons";
import { ZoomCluster } from "@/ui/ZoomCluster";
import { Modal } from "@/ui/Modal";
import { InsertGallery } from "@/ui/InsertGallery";
import { PaperMenu } from "@/ui/PaperMenu";
import { HelpModal } from "@/ui/HelpModal";
import { BoardsManager } from "@/ui/BoardsManager";
import { NamePrompt } from "@/ui/NamePrompt";
import { useBoardStore } from "@/board/store";
import { useUiStore } from "@/ui/uiStore";
import { screenToWorld } from "@/board/geometry";
import { getTool } from "@/tools/registry";
import { id as makeId } from "@/board/types";
import { theme } from "@/styles/theme";
import type { AnyBoardObject } from "@/board/types";
import type { CanvasTool, WidgetTool } from "@/tools/registry";

// --- modal routing ---------------------------------------------------------

type ModalState =
  | { kind: "insert" }
  | { kind: "dialog"; toolType: string; objId?: string; initial?: Record<string, unknown> }
  | { kind: "help" }
  | { kind: "boards" }
  | { kind: "saveAs"; initial: string }
  | { kind: "share" }
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

  // Load (or create) the current board once on mount. When the URL carries a
  // share link (?board=<id>) and no display name is stored yet, ask for the
  // name FIRST — init() then joins the shared board with it.
  useEffect(() => {
    if (boardIdFromUrl() && !getStoredName()) {
      setModal({ kind: "joinName" });
      return; // init() runs from the prompt's onSubmit
    }
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
  // object (mod 6) so successive inserts fan out instead of stacking.
  const placeNew = useCallback(
    (toolType: string, params: Record<string, unknown>) => {
      const size = toolSize(toolType, params);
      if (!size) return;
      const { camera, board } = useBoardStore.getState();
      const r = document.getElementById("stage")?.getBoundingClientRect();
      const W = r?.width ?? 0;
      const H = r?.height ?? 0;
      const centre = screenToWorld(camera, W / 2, H / 2);
      const casc = (board.objects.length % 6) * 22;
      const obj: AnyBoardObject = {
        id: makeId(),
        type: toolType,
        x: centre.x - size.w / 2 + casc,
        y: centre.y - size.h / 2 + casc,
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

  // Toolbar / keyboard "edit selected": resolve the selection, then route.
  // Editing applies to exactly one object (a stroke or multi-select has no
  // settings dialog).
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
  // selects everything; Escape clears the selection; Ctrl/Cmd+Z undoes,
  // +Shift redoes. Suppressed while any modal is open or a text object is being
  // edited in place (the textarea/worksheet inputs stopPropagation on their own
  // keys).
  useEffect(() => {
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
      if ((e.key === "Delete" || e.key === "Backspace") && hasSelection) {
        e.preventDefault();
        st.deleteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        st.setTool("select");
        st.selectAll();
      } else if (e.key === "Escape" && hasSelection) {
        e.preventDefault();
        st.clearSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave, doSaveAs]);

  // --- the open tool Dialog (create or edit), resolved from the registry ---
  let dialogNode: JSX.Element | null = null;
  if (modal?.kind === "dialog") {
    const Dialog = getTool(modal.toolType)?.Dialog;
    if (Dialog) {
      const editing = modal.objId != null;
      dialogNode = (
        <Dialog
          initial={modal.initial as never}
          onSubmit={handleDialogSubmit as never}
          // CREATE cancel returns to the gallery; EDIT cancel just closes.
          onCancel={editing ? closeModal : () => setModal({ kind: "insert" })}
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
        onHelp={() => setModal({ kind: "help" })}
        onEditSelected={editSelected}
        onShare={() => setModal({ kind: "share" })}
      />

      {/* #stage is the positioned board viewport. It holds the two stacked
          canvases + in-place text editor (BoardCanvas), the interactive widget
          overlay (WidgetLayer), and the zoom cluster. FloatButtons portals in. */}
      <div id="stage" ref={setStageRef}>
        <BoardCanvas onEditObject={openEditFor} />
        <WidgetLayer onEditObject={openEditFor} />
        <PresenceLayer />
        <ZoomCluster getStageSize={getStageSize} />
      </div>

      {/* Float edit/delete buttons portal into #stage (positioned absolute). */}
      <FloatButtons container={stageEl} onEditSelected={editSelected} />

      <PaperMenu anchor={paperAnchor} onClose={() => setPaperAnchor(null)} />

      <Modal open={modal?.kind === "insert"} onClose={closeModal}>
        <InsertGallery onPick={handlePick} />
      </Modal>

      <Modal open={modal?.kind === "dialog"} onClose={closeModal}>
        {dialogNode}
      </Modal>

      <Modal open={modal?.kind === "help"} onClose={closeModal}>
        <HelpModal onClose={closeModal} />
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

      <Modal open={modal?.kind === "share"} onClose={closeModal}>
        {modal?.kind === "share" && <ShareModal onClose={closeModal} />}
      </Modal>

      {/* Joining a shared link: ask for a display name, then join. Closing the
          prompt joins as "Guest" rather than stranding the user on a blank app. */}
      <Modal
        open={modal?.kind === "joinName"}
        onClose={() => handleJoinName("Guest")}
      >
        {modal?.kind === "joinName" && (
          <NamePrompt
            title="Joining a shared board — what's your name?"
            confirmLabel="Join"
            onSubmit={handleJoinName}
            onCancel={() => handleJoinName("Guest")}
          />
        )}
      </Modal>

      {savedFlash && (
        <div id="savedToast" role="status">
          Saved ✓
        </div>
      )}
    </>
  );
}
