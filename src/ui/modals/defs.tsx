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
import { keyHint } from "@/ui/shortcuts";
import { setStoredName } from "@/collab/profile";
import { IS_LANGUAGE } from "@/subject";
import { LangNewBoard } from "@/lang/LangNewBoard";
import { LangWelcome } from "@/lang/LangWelcome";
import { ContentManager } from "@/lang/ContentManager";
import { VoiceSettings } from "@/lang/VoiceSettings";
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

// Welcome screen — the landing hub. Plain loads front it (share links join
// directly), and the board-title chip reopens it. Closing it any way —
// Continue, backdrop, Escape — resumes the draft. The language board gets the
// three-choice launcher (new / open / join); the maths board keeps its simpler
// welcome (continue + new + open + inline join).
const welcomeModal = defineModal("welcome", {
  render: (_s, api) =>
    IS_LANGUAGE ? (
      <LangWelcome
        onClose={api.close}
        onNew={() => api.open({ kind: "langNew" })}
        onOpen={() => api.open({ kind: "boards" })}
        onVoices={() => api.open({ kind: "voices" })}
        onContent={() => api.open({ kind: "content", tab: "library" })}
      />
    ) : (
      <WelcomeModal
        onClose={api.close}
        onOpenBoards={() => api.open({ kind: "boards" })}
      />
    ),
});

// Language board only: choose the languages when starting a new board, then
// create it. Reached from the welcome hub and the boards manager's New; Cancel
// returns to the welcome hub so backing out of creation lands on the launcher.
const langNewModal = defineModal("langNew", {
  render: (_s, api) => (
    <LangNewBoard
      onStart={(setup) => {
        void useBoardStore.getState().newBoard(setup);
        api.close();
      }}
      onCancel={() => api.open({ kind: "welcome" })}
      onManageContent={() => api.open({ kind: "content", tab: "library" })}
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

// Language board only: THE content manager — one screen for what this board
// teaches, the packs on this device, and creating your own.
const contentModal = defineModal("content", {
  render: (state) => <ContentManager initialTab={state.tab} />,
});

// Language board only: choose which voice reads each language aloud.
const voicesModal = defineModal("voices", {
  render: () => <VoiceSettings />,
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

// Long press on a widget's top bar -> "Delete this?". The widget layer arms
// the hold; App routes it here. Deliberately a confirmation and not a straight
// delete: the press is held over a live activity that may hold a class's typed
// answers, and on touch there is no hover to tell you what you're about to hit.
const confirmDeleteModal = defineModal("confirmDelete", {
  render: (state, api) => {
    const { board, removeObject } = useBoardStore.getState();
    const obj = board.objects.find((o) => o.id === state.objId);
    // Already gone (a collaborator deleted it while the sheet was up).
    if (!obj) return <p className="hint">That has already been deleted.</p>;
    const name = getTool(obj.type)?.name ?? "this";
    return (
      <>
        <h2>Delete {name}?</h2>
        <p className="hint">
          It goes from the board for everyone, along with anything typed into
          it. {keyHint("undo")} brings it back.
        </p>
        <div className="card-actions">
          <button className="btn" onClick={api.close}>
            Cancel
          </button>
          <button
            className="btn primary"
            id="confirmDeleteBtn"
            onClick={() => {
              removeObject(obj.id);
              api.close();
            }}
          >
            Delete
          </button>
        </div>
      </>
    );
  },
});

const boardsModal = defineModal("boards", {
  render: (_s, api) => (
    <BoardsManager
      onClose={api.close}
      // Language board: the "teaches …" line on the open board opens the
      // content manager on the tab that changes it.
      onContent={IS_LANGUAGE ? () => api.open({ kind: "content", tab: "board" }) : undefined}
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
  confirmDeleteModal,
  saveAsModal,
  shareModal,
  joinNameModal,
  aboutModal,
  contentModal,
  voicesModal,
];

export function getModalDef(kind: ModalState["kind"]): ModalDef | undefined {
  return MODALS.find((d) => d.kind === kind);
}
