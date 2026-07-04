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
import { ShortcutsHelp } from "@/ui/ShortcutsHelp";
import { useImageDrop } from "@/ui/useImageDrop";
import { useBoardStore } from "@/board/store";
import { screenToWorld } from "@/board/geometry";
import { COLLAB_ENABLED } from "@/config";
import { getTool } from "@/tools/registry";
import { id as makeId } from "@/board/types";
import { theme } from "@/styles/theme";
import { handleShortcut, type ShortcutHost } from "@/ui/shortcuts";
import type { AnyBoardObject } from "@/board/types";
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
  | { kind: "help" }
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

// The global keyboard shortcuts — tool keys, the internal clipboard
// (copy/cut/paste/duplicate), colour/size, arrow-nudge and Save — live in
// src/ui/shortcuts.ts as a single declarative catalog that also drives the
// help sheet. App only supplies the ShortcutHost (the actions that open a
// modal or save) and forwards keydown to handleShortcut.

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

  // --- global keyboard shortcuts ------------------------------------------
  // The whole catalog (which key does what, its guards, and its help text)
  // lives in src/ui/shortcuts.ts; handleShortcut runs it against each keydown.
  // Here we only bind the listener and supply the host — the actions that open
  // a modal or save, which the catalog can't perform on its own. Everything
  // else (tools, clipboard, colour/size, nudge) is pure store work in there.
  useEffect(() => {
    const host: ShortcutHost = {
      save: () => void doSave(),
      saveAs: doSaveAs,
      openInsert: () => setModal({ kind: "insert" }),
      openImage: () => handlePick("image"),
      openHelp: () => setModal({ kind: "help" }),
    };
    const onKey = (e: KeyboardEvent) => handleShortcut(e, host);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave, doSaveAs, handlePick]);

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
        onHelp={() => setModal({ kind: "help" })}
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

      <Modal open={modal?.kind === "help"} onClose={closeModal}>
        <ShortcutsHelp />
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
