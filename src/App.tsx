// The application shell. Owns the #stage viewport and composes the toolbar, the
// board canvas (two <canvas> layers + in-place text editor), the interactive
// widget overlay, the zoom cluster, the floating edit/delete buttons, the paper
// menu and the modal host. Everything behavioural is delegated:
//
//   - modal routing/bodies       -> ui/modals (registry + ModalHost, T2)
//   - object placement & editing -> board/commands + board/sizing (T3)
//   - PNG export                 -> canvas/export (no DOM reach into the canvas)
//   - keyboard shortcuts         -> ui/shortcuts (App only supplies the host:
//                                   the few actions that open a modal or save)
//
// What legitimately remains: layout/composition, boot/join, the save flows +
// "Saved" toast wiring, image-drop wiring, and the #stage ref plumbing.

import { useCallback, useEffect, useState } from "react";
import { BoardCanvas } from "@/canvas/BoardCanvas";
import { WidgetLayer } from "@/canvas/WidgetLayer";
import { PresenceLayer } from "@/ui/PresenceLayer";
import { boardIdFromUrl } from "@/collab/session";
import { getStoredName } from "@/collab/profile";
import { Toolbar } from "@/ui/Toolbar";
import { FloatButtons } from "@/ui/FloatButtons";
import { ZoomCluster } from "@/ui/ZoomCluster";
import { PaperMenu } from "@/ui/PaperMenu";
import { ModalHost, pickTool } from "@/ui/modals";
import type { ModalState } from "@/ui/modals";
import { useImageDrop } from "@/ui/useImageDrop";
import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { useUiStore } from "@/ui/uiStore";
import { placeObject } from "@/board/commands";
import { paramsOf } from "@/board/sizing";
import { exportPNG } from "@/canvas/export";
import { COLLAB_ENABLED } from "@/config";
import { getTool } from "@/tools/registry";
import { handleShortcut, type ShortcutHost } from "@/ui/shortcuts";
import type { AnyBoardObject } from "@/board/types";

export default function App(): JSX.Element {
  const init = useBoardStore((s) => s.init);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [paperAnchor, setPaperAnchor] = useState<HTMLElement | null>(null);
  const savedFlash = useUiStore((s) => s.savedFlash);
  // The #stage element (owned by App) FloatButtons portals into and ZoomCluster
  // measures. Captured via a callback ref so it's available on first commit.
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null);
  const getStageSize = useCallback(() => {
    const r = stageEl?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  }, [stageEl]);

  // Load (or create) the current board once on mount.
  //   - Share link (?board=<id>): join directly, asking for a display name
  //     FIRST if none is stored — the joinName modal (ui/modals) stores the
  //     name and then runs init() itself.
  //   - Plain load: show the WELCOME screen while init() loads the draft
  //     behind it. Continue just closes it; Join / New / Open replace the
  //     draft from inside the modal.
  useEffect(() => {
    if (boardIdFromUrl()) {
      if (!getStoredName()) {
        setModal({ kind: "joinName" });
        return; // init() runs from the prompt's onSubmit (see ui/modals/defs)
      }
      void init();
      return;
    }
    setModal({ kind: "welcome" });
    void init();
  }, [init]);

  const closeModal = useCallback(() => setModal(null), []);

  // --- Save board (draft -> library) ---------------------------------------
  // Ctrl/Cmd+S: save over the linked library board. A never-saved draft has no
  // linked board, so fall back to Save as (prompt for a name). The saveAs
  // modal itself flashes the toast on submit.
  const doSave = useCallback(async () => {
    const { needsName } = await useBoardStore.getState().saveCurrent();
    if (needsName) setModal({ kind: "saveAs", initial: "" });
    else useUiStore.getState().flashSaved();
  }, []);

  // Ctrl/Cmd+Shift+S: save as a new named board (solo) or name the shared board
  // (shared) — either way prefill the current name when there is one.
  const doSaveAs = useCallback(() => {
    const { board, sourceId } = useBoardStore.getState();
    const shared = useCollabStore.getState().mode === "shared";
    setModal({ kind: "saveAs", initial: shared || sourceId ? board.name : "" });
  }, []);

  // --- open the settings Dialog for an existing object (EDIT) --------------
  // Shared by the float edit button, BoardCanvas's onEditObject (double-click)
  // and the WidgetLayer. Tools without a Dialog (free text) are edited in
  // place by the canvas and never routed here.
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

  // The Picture button / shortcut routes like a gallery pick (dialog vs
  // direct-place decided by the tool's registration).
  const openImage = useCallback(() => {
    pickTool("image", { open: setModal, close: () => setModal(null) });
  }, []);

  // Drag-and-drop an image file onto the board: uploads via the same backend
  // path as the Picture dialog, then places it at the drop point. Wired to
  // #stage only in collab builds (COLLAB_ENABLED) — the backend does the upload.
  const imageDrop = useImageDrop(
    useCallback((image, at) => placeObject("image", { ...image }, { at }), []),
  );

  // --- global keyboard shortcuts --------------------------------------------
  // The whole catalog (which key does what, its guards, and its help text)
  // lives in src/ui/shortcuts.ts; handleShortcut runs it against each keydown.
  // Here we only bind the listener and supply the host — the actions that open
  // a modal or save, which the catalog can't perform on its own.
  useEffect(() => {
    const host: ShortcutHost = {
      save: () => void doSave(),
      saveAs: doSaveAs,
      openInsert: () => setModal({ kind: "insert" }),
      openImage,
      openHelp: () => setModal({ kind: "help" }),
    };
    const onKey = (e: KeyboardEvent) => handleShortcut(e, host);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave, doSaveAs, openImage]);

  return (
    <>
      <Toolbar
        onInsert={() => setModal({ kind: "insert" })}
        onBoards={() => setModal({ kind: "boards" })}
        onPaper={(anchor) => setPaperAnchor(anchor)}
        onSaveImage={exportPNG}
        onShare={() => setModal({ kind: "share" })}
        onJoin={() => setModal({ kind: "join" })}
        onAddImage={openImage}
        onHelp={() => setModal({ kind: "help" })}
      />

      {/* #stage is the positioned board viewport. It holds the two stacked
          canvases + in-place text editor (BoardCanvas), the interactive widget
          overlay (WidgetLayer), and the zoom cluster. FloatButtons portals in. */}
      <div
        id="stage"
        ref={setStageEl}
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

      {/* Every modal/dialog: routed by kind through the registry (ui/modals). */}
      <ModalHost state={modal} onOpen={setModal} onClose={closeModal} />

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
