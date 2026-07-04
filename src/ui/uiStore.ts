// Small UI-only store, separate from the board document/ephemeral store.
//
// Holds `modalOpen`, the flag the prototype kept (line 154) so the canvas can
// suppress keyboard shortcuts (Delete / Ctrl+Z) while a dialog is up, and the
// transient "Saved ✓" toast. The board store deliberately owns only board +
// ephemeral drawing state; transient chrome like these lives here so the two
// concerns stay separate.
//
// The Modal component sets/clears modalOpen as it mounts/unmounts; shortcuts
// read it (useUiStore.getState().modalOpen) to gate the global keydown handler.

import { create } from "zustand";

interface UiState {
  modalOpen: boolean;
  setModalOpen(open: boolean): void;
  /** True briefly after a successful explicit save (drives the toast). */
  savedFlash: boolean;
  /** Show the "Saved ✓" confirmation for a moment. */
  flashSaved(): void;
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiStore = create<UiState>((set) => ({
  modalOpen: false,
  setModalOpen(open) {
    set({ modalOpen: open });
  },
  savedFlash: false,
  flashSaved() {
    set({ savedFlash: true });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ savedFlash: false }), 1400);
  },
}));
