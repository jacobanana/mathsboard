// The single modal host (T2): resolves the current ModalState against the
// registry and renders the matching body inside the existing Modal shell, so
// the uiStore.modalOpen behaviour (shortcut gating) is unchanged underneath.

import { Modal } from "@/ui/Modal";
import { COLLAB_ENABLED } from "@/config";
import { getModalDef } from "@/ui/modals/defs";
import type { ModalApi, ModalState } from "@/ui/modals/types";

export interface ModalHostProps {
  state: ModalState | null;
  onOpen(next: ModalState): void;
  onClose(): void;
}

export function ModalHost({ state, onOpen, onClose }: ModalHostProps): JSX.Element {
  const def = state ? getModalDef(state.kind) : undefined;
  // A collab-only modal in a non-collab build renders as closed.
  const open = def != null && (!def.collabOnly || COLLAB_ENABLED);
  const api: ModalApi = { close: onClose, open: onOpen };
  return (
    <Modal
      open={open}
      onClose={() => {
        if (open && def!.onRequestClose) def!.onRequestClose(state!, api);
        else onClose();
      }}
    >
      {open ? def!.render(state!, api) : null}
    </Modal>
  );
}
