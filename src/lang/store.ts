// THE LANGUAGE-PAIR STORE — which languages the learner knows / is learning.
//
// This is LOCAL, per-device preference (like the display name), NOT board
// document state: it decides what NEW widgets seed themselves with, but a
// widget bakes the actual { known, learning } codes into its own params at
// creation time (see each tool's defaults/Dialog). That keeps a placed activity
// stable and collaboration-safe even if the learner later switches languages —
// exactly the reason the maths widgets store their generated content on the
// object rather than reading a live global.
//
// Persisted to localStorage so the choice survives reloads; the welcome screen
// on the language board reads and writes it (see LanguageSetup).

import { create } from "zustand";
import { defaultPair, isValidPair, type LangPair } from "@/lang/pairs";
import { bumpGalleryVersion } from "@/tools/registry";

const STORAGE_KEY = "langboard.pair.v1";

function load(): LangPair {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LangPair;
      if (parsed && isValidPair(parsed)) return parsed;
    }
  } catch {
    /* ignore malformed / unavailable storage */
  }
  return defaultPair();
}

function persist(pair: LangPair): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pair));
  } catch {
    /* storage may be unavailable (private mode) — the choice is still live */
  }
}

interface LangState {
  pair: LangPair;
  /** Set the whole pair (ignored if the two languages are the same/unknown). */
  setPair(pair: LangPair): void;
  setKnown(code: string): void;
  setLearning(code: string): void;
}

export const useLangStore = create<LangState>((set, get) => ({
  pair: load(),
  setPair(pair) {
    if (!isValidPair(pair)) return;
    persist(pair);
    set({ pair });
    // A new learning language may gain or lose gendered nouns / prepositions —
    // let the Insert gallery re-check its content-gated tools.
    bumpGalleryVersion();
  },
  setKnown(code) {
    const next = { ...get().pair, known: code };
    // Choosing your known language to equal the target swaps the target away so
    // the pair stays valid instead of silently rejecting the click.
    if (next.known === next.learning) {
      const other = defaultPair();
      next.learning = other.known === code ? other.learning : other.known;
    }
    if (isValidPair(next)) get().setPair(next);
  },
  setLearning(code) {
    const next = { ...get().pair, learning: code };
    if (next.known === next.learning) {
      const other = defaultPair();
      next.known = other.learning === code ? other.known : other.learning;
    }
    if (isValidPair(next)) get().setPair(next);
  },
}));

/** Read the current pair outside React (widget defaults seed from this). */
export const currentPair = (): LangPair => useLangStore.getState().pair;
