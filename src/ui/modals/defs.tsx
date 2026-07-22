// THE MODAL REGISTRY (T2 in docs/canvas-app-architecture.md).
//
// One entry per modal/flow, in no particular order (routing is by `kind`).
// Bodies delegate real work to the board-command service (placeObject /
// editObject) and the stores, so a def stays a thin view + wiring. Collab
// gating is the `collabOnly` flag — the host enforces it, no inline guards.

import { useBoardStore } from "@/board/store";
import { useUiStore } from "@/ui/uiStore";
import { placeObject, editObject } from "@/board/commands";
import { getTool } from "@/tools/registry";
import { setStoredName } from "@/collab/profile";
import { IS_LANGUAGE } from "@/subject";
import { LangNewBoard } from "@/lang/LangNewBoard";
import { ContentStudio } from "@/lang/ContentStudio";
import { WelcomeModal } from "@/ui/WelcomeModal";
import { InsertGallery } from "@/ui/InsertGallery";
import { ShortcutsHelp } from "@/ui/ShortcutsHelp";
import { About } from "@/ui/About";
import { BoardsManager } from "@/ui/BoardsManager";
import { NamePrompt } from "@/ui/NamePrompt";
import { ShareModal } from "@/ui/ShareModal";
import { JoinForm } from "@/ui/JoinForm";
import { defineModal } from "@/ui/modals/types";
import type { ModalApi, ModalDef, ModalState } from "@/ui/modals/types";

/**
 * Route an insert-gallery pick (also used directly for the Picture button /
 * shortcut): tools with a Dialog open it in CREATE mode; click-to-place tools
 * land immediately with their defaults.
 */
export function pickTool(toolType: string, api: ModalApi): void {
  const tool = getTool(toolType);
  if (!tool) return;
  if (tool.Dialog) {
    api.open({ kind: "dialog", toolType });
  } else {
    placeObject(toolType, tool.defaults());
    api.close();
  }
}

/** Store the display name, close the prompt, then join via init(). */
function joinWithName(name: string, api: ModalApi): void {
  setStoredName(name);
  api.close();
  void useBoardStore.getState().init();
}

// Welcome screen (plain loads only; share links join directly). Closing it any
// way — Continue, backdrop, Escape — resumes the draft.
const welcomeModal = defineModal("welcome", {
  render: (_s, api) => (
    <WelcomeModal
      onClose={api.close}
      onOpenBoards={() => api.open({ kind: "boards" })}
      // Language board: "New board" first asks which languages (langNew).
      onNewBoard={IS_LANGUAGE ? () => api.open({ kind: "langNew" }) : undefined}
    />
  ),
});

// Language board only: choose the languages when starting a new board, then
// create it. Reached from the welcome screen and the boards manager's New.
const langNewModal = defineModal("langNew", {
  render: (_s, api) => (
    <LangNewBoard
      onStart={() => {
        void useBoardStore.getState().newBoard();
        api.close();
      }}
      onCancel={api.close}
    />
  ),
});

// Mid-session "Join a board" (toolbar Join button).
const joinModal = defineModal("join", {
  collabOnly: true,
  render: (_s, api) => (
    <>
      <h2>Join a board</h2>
      <p className="hint">
        Type the code you were given, or paste the link. Your current drawing
        stays saved as your own draft.
      </p>
      <JoinForm autoFocus onJoined={api.close} />
      <div className="card-actions">
        <button className="btn" onClick={api.close}>
          Cancel
        </button>
      </div>
    </>
  ),
});

const insertModal = defineModal("insert", {
  render: (_s, api) => (
    <InsertGallery onPick={(toolType) => pickTool(toolType, api)} />
  ),
});

const helpModal = defineModal("help", {
  render: () => <ShortcutsHelp />,
});

// About & credits: open-source acknowledgements, privacy policy, licence.
const aboutModal = defineModal("about", {
  render: () => <About />,
});

// Language board only: create/import custom content packs (help + importer).
const contentModal = defineModal("content", {
  render: () => <ContentStudio />,
});

// A tool's settings Dialog, resolved from the tool registry (CREATE or EDIT).
const dialogModal = defineModal("dialog", {
  render(state, api) {
    const tool = getTool(state.toolType);
    const Dialog = tool?.Dialog;
    if (!Dialog) return null;
    const editing = state.objId != null;
    // CREATE cancel returns to the gallery — but only for tools that live in
    // it. A tool opened from a dedicated entry point (e.g. the Picture
    // button, inGallery:false) has nowhere to go back to, so cancel closes.
    // EDIT cancel always just closes.
    const backToGallery = !editing && tool?.inGallery !== false;
    return (
      <Dialog
        initial={state.initial as never}
        onSubmit={
          ((params: Record<string, unknown>) => {
            if (state.objId != null) editObject(state.objId, params);
            else placeObject(state.toolType, params);
            api.close();
          }) as never
        }
        onCancel={
          backToGallery ? () => api.open({ kind: "insert" }) : api.close
        }
      />
    );
  },
});

const boardsModal = defineModal("boards", {
  render: (_s, api) => (
    <BoardsManager
      onClose={api.close}
      // Language board: New board asks languages first (langNew) instead of
      // creating a blank board straight away.
      onNewBoard={IS_LANGUAGE ? () => api.open({ kind: "langNew" }) : undefined}
    />
  ),
});

const saveAsModal = defineModal("saveAs", {
  render: (state, api) => (
    <NamePrompt
      title="Save board as"
      initial={state.initial}
      confirmLabel="Save"
      onSubmit={async (name) => {
        await useBoardStore.getState().saveAs(name);
        api.close();
        useUiStore.getState().flashSaved();
      }}
      onCancel={api.close}
    />
  ),
});

const shareModal = defineModal("share", {
  collabOnly: true,
  render: (_s, api) => <ShareModal onClose={api.close} />,
});

// Joining a shared link: ask for a display name, then join. Dismissing the
// prompt joins as "Guest" rather than stranding the user on a blank app.
// Collab-only — plain loads never reach it since boardIdFromUrl() returns null
// when collaboration is compiled out.
const joinNameModal = defineModal("joinName", {
  collabOnly: true,
  onRequestClose: (_s, api) => joinWithName("Guest", api),
  render: (_s, api) => (
    <NamePrompt
      title="Joining a shared board — what's your name?"
      confirmLabel="Join"
      onSubmit={(name) => joinWithName(name, api)}
      onCancel={() => joinWithName("Guest", api)}
    />
  ),
});

export const MODALS: ModalDef[] = [
  welcomeModal,
  langNewModal,
  joinModal,
  insertModal,
  helpModal,
  dialogModal,
  boardsModal,
  saveAsModal,
  shareModal,
  joinNameModal,
  aboutModal,
  contentModal,
];

export function getModalDef(kind: ModalState["kind"]): ModalDef | undefined {
  return MODALS.find((d) => d.kind === kind);
}
