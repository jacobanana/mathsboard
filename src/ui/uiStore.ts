// Small UI-only store, separate from the board document/ephemeral store.
//
// Holds `modalOpen`, the flag the prototype kept (line 154) so the canvas can
// suppress keyboard shortcuts (Delete / Ctrl+Z) while a dialog is up, whether
// the active tool's options pill is folded away, and the transient "Saved ✓"
// toast. The board store deliberately owns only board +
// ephemeral drawing state; transient chrome like these lives here so the two
// concerns stay separate.
//
// The Modal component sets/clears modalOpen as it mounts/unmounts; shortcuts
// read it (useUiStore.getState().modalOpen) to gate the global keydown handler.

import { create } from "zustand";

interface UiState {
  modalOpen: boolean;
  setModalOpen(open: boolean): void;
  /**
   * Is the active tool's options pill showing? Pressing the tool's OWN dock
   * button folds it away and back (the draw pill is two rows of controls — a
   * lot of a phone screen when you just want to draw), without touching a
   * single setting inside it. Chrome state, not board state: it never syncs,
   * persists or undoes, and switching tools always brings the pill back.
   */
  optionsOpen: boolean;
  setOptionsOpen(open: boolean): void;
  toggleOptions(): void;
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
  optionsOpen: true,
  setOptionsOpen(open) {
    set({ optionsOpen: open });
  },
  toggleOptions() {
    set((s) => ({ optionsOpen: !s.optionsOpen }));
  },
  savedFlash: false,
  flashSaved() {
    set({ savedFlash: true });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ savedFlash: false }), 1400);
  },
}));
