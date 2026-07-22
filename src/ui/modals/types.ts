// THE MODAL CONTRACT (T2 in docs/canvas-app-architecture.md).
//
// Every modal/flow is a ModalDef registered in ui/modals/defs.tsx; the single
// <ModalHost> (rendered by App) resolves the current ModalState against the
// registry and renders the matching body inside the shared Modal shell. Adding
// a dialog = adding a registry entry; App is never edited.

import type { ReactNode } from "react";

/** The routing state: which modal is up, plus its per-kind payload. */
export type ModalState =
  | { kind: "welcome" }
  | { kind: "insert" }
  | {
      kind: "dialog";
      toolType: string;
      /** Present -> EDIT that object; absent -> CREATE a new one. */
      objId?: string;
      initial?: Record<string, unknown>;
    }
  | { kind: "boards" }
  | { kind: "saveAs"; initial: string }
  | { kind: "share" }
  | { kind: "join" }
  | { kind: "joinName" }
  | { kind: "help" }
  | { kind: "about" }
  // Language board only: choose the languages when starting a new board.
  | { kind: "langNew" }
  // Language board only: create/import custom content packs.
  | { kind: "content" };

/** What a modal body can do to the router. */
export interface ModalApi {
  close(): void;
  /** Replace the open modal (e.g. dialog "Back" -> { kind: "insert" }). */
  open(next: ModalState): void;
}

export interface ModalDef<S extends ModalState = ModalState> {
  kind: S["kind"];
  /**
   * Only exists in collaborative builds: when COLLAB_ENABLED is false the
   * host treats the state as closed (declared once, not re-checked inline).
   */
  collabOnly?: boolean;
  /**
   * Override what dismissing the modal (backdrop click / Escape) does.
   * Default: api.close(). The joinName prompt uses this to join as "Guest"
   * instead of stranding the user on a blank app.
   */
  onRequestClose?(state: S, api: ModalApi): void;
  // Method (not property) syntax on purpose: methods are bivariant, so a
  // ModalDef<{kind:"saveAs";...}> still assigns into the ModalDef[] registry.
  render(state: S, api: ModalApi): ReactNode;
}

/** Helper giving defs full inference on their own state variant. The kind is
 *  a direct argument (not a field) so TypeScript can infer K from the literal. */
export function defineModal<K extends ModalState["kind"]>(
  kind: K,
  def: Omit<ModalDef<Extract<ModalState, { kind: K }>>, "kind">,
): ModalDef {
  return { kind, ...def } as ModalDef;
}
