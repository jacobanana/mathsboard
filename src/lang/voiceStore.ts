// THE VOICE-PROFILE STORE — which speech voice speaks each language, how fast,
// and whether tap-to-speak is on at all.
//
// Like the language-pair store (lang/store.ts) this is a LOCAL, per-device
// preference, NOT board document state: which voices a device has installed is a
// property of the device, so a shared board can't carry them. It records, per
// language code, the `voiceURI` the learner chose (from the voices the browser
// exposes — see lang/speech.ts), a global speaking rate (learners often want it
// slower), and a master on/off toggle. The speech engine reads this out of React
// through currentVoicePrefs(); the settings page (lang/VoiceSettings.tsx) writes
// it; the 🔊 buttons (lang/SpeakButton.tsx) react to `enabled`.
//
// Persisted to localStorage so the choice survives reloads. A chosen voice that
// is no longer present on this device is tolerated: speech.ts falls back to any
// voice for the language, so a stale URI never breaks playback.

import { create } from "zustand";

const STORAGE_KEY = "langboard.voices.v1";

/** Speaking-rate bounds. 1 is the browser default; slower helps learners. */
export const MIN_RATE = 0.5;
export const MAX_RATE = 1.25;
export const DEFAULT_RATE = 0.9;

export const clampRate = (r: number): number =>
  Math.max(MIN_RATE, Math.min(MAX_RATE, r));

/** The persisted shape: a chosen voice per language code, a rate, a master
 *  toggle. `byLang[code]` is a SpeechSynthesisVoice.voiceURI. */
export interface VoicePrefs {
  byLang: Record<string, string>;
  rate: number;
  enabled: boolean;
}

function defaults(): VoicePrefs {
  return { byLang: {}, rate: DEFAULT_RATE, enabled: true };
}

function load(): VoicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
      return {
        byLang:
          parsed.byLang && typeof parsed.byLang === "object" ? parsed.byLang : {},
        rate: clampRate(typeof parsed.rate === "number" ? parsed.rate : DEFAULT_RATE),
        enabled: parsed.enabled !== false,
      };
    }
  } catch {
    /* ignore malformed / unavailable storage */
  }
  return defaults();
}

function persist(prefs: VoicePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable (private mode) — the choice is still live */
  }
}

interface VoiceState extends VoicePrefs {
  /** Choose the voice (by voiceURI) for a language; "" clears back to default. */
  setVoice(code: string, voiceURI: string): void;
  setRate(rate: number): void;
  setEnabled(enabled: boolean): void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  ...load(),
  setVoice(code, voiceURI) {
    const byLang = { ...get().byLang };
    if (voiceURI) byLang[code] = voiceURI;
    else delete byLang[code];
    const next = { ...prefsOf(get()), byLang };
    persist(next);
    set({ byLang });
  },
  setRate(rate) {
    const r = clampRate(rate);
    persist({ ...prefsOf(get()), rate: r });
    set({ rate: r });
  },
  setEnabled(enabled) {
    persist({ ...prefsOf(get()), enabled });
    set({ enabled });
  },
}));

/** Strip the actions off the store, leaving just the persisted prefs. */
const prefsOf = (s: VoiceState): VoicePrefs => ({
  byLang: s.byLang,
  rate: s.rate,
  enabled: s.enabled,
});

/** Read the current prefs outside React (the speech engine seeds from this). */
export const currentVoicePrefs = (): VoicePrefs => prefsOf(useVoiceStore.getState());
