// THE TEXT-TO-SPEECH ENGINE — say a word or sentence out loud in the right
// voice for its language, using the browser-native Web Speech API
// (window.speechSynthesis). No backend, no API key, works offline from the
// voices the device's OS provides — so it fits both the static (GitHub Pages)
// and self-hosted builds with no server involved.
//
// The learner's chosen voice per language lives in lang/voiceStore.ts; this
// module turns a { text, languageCode } into an utterance, picks the voice, and
// speaks it. Content language codes are ISO 639-1 ("pt"); the OS exposes voices
// tagged with BCP-47 locales ("pt-BR", "pt-PT"), so the matching here is on the
// PRIMARY subtag — which is exactly why one "pt" language surfaces BOTH a
// Portugal and a Brazil voice for the learner to choose between.
//
// The pure matchers (primarySubtag / matchVoices / chooseVoice) take a voice
// list as an argument so they can be unit-tested without a real speech engine;
// the stateful layer below caches window.speechSynthesis.getVoices() and
// refreshes on the async `voiceschanged` event (Chrome returns an empty list
// until it fires).

import { clampRate, currentVoicePrefs } from "@/lang/voiceStore";

// --- feature detection ------------------------------------------------------

function getSynth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;
}

/** True when this browser can synthesise speech (Firefox for Android can't). */
export const speechSupported = (): boolean =>
  getSynth() != null && typeof SpeechSynthesisUtterance !== "undefined";

// --- pure locale matching (unit-tested) -------------------------------------

/** The lowercased primary language subtag: "pt-BR" -> "pt", "en_GB" -> "en". */
export const primarySubtag = (lang: string): string =>
  (lang || "").toLowerCase().split(/[-_]/)[0];

/** The uppercased region subtag, or "" when the tag has none: "pt-BR" -> "BR". */
export const regionSubtag = (lang: string): string => {
  const parts = (lang || "").split(/[-_]/);
  return parts.length > 1 ? parts[1].toUpperCase() : "";
};

/**
 * Every available voice whose primary subtag equals `code`, so language "pt"
 * returns both pt-BR and pt-PT voices. Sorted so that — when the content code
 * itself carries a region — exact-region voices come first, then grouped by
 * locale with the OS default voice ahead of the rest, then by name. That keeps
 * the settings dropdown stable and readable (Portugal voices together, Brazil
 * voices together).
 */
export function matchVoices(
  voices: SpeechSynthesisVoice[],
  code: string,
): SpeechSynthesisVoice[] {
  const c = primarySubtag(code);
  const region = regionSubtag(code);
  return voices
    .filter((v) => primarySubtag(v.lang) === c)
    .sort((a, b) => {
      if (region) {
        const ar = regionSubtag(a.lang) === region ? 0 : 1;
        const br = regionSubtag(b.lang) === region ? 0 : 1;
        if (ar !== br) return ar - br;
      }
      if (a.lang !== b.lang) return a.lang.localeCompare(b.lang);
      if (a.default !== b.default) return a.default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * The voice to speak `code` with: the learner's chosen voice if it is still
 * installed, else the best available voice for the language, else undefined
 * (the caller then leaves it to the browser's own default for the lang).
 */
export function chooseVoice(
  voices: SpeechSynthesisVoice[],
  code: string,
  chosenURI?: string,
): SpeechSynthesisVoice | undefined {
  const matches = matchVoices(voices, code);
  if (chosenURI) {
    const chosen =
      matches.find((v) => v.voiceURI === chosenURI) ??
      voices.find((v) => v.voiceURI === chosenURI);
    if (chosen) return chosen;
  }
  return matches[0];
}

let regionNames: Intl.DisplayNames | null | undefined;
function displayRegion(region: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(region) ?? region;
  } catch {
    return region;
  }
}

/** A menu label for a voice that makes its accent obvious, e.g.
 *  "Brazil — Google português do Brasil" or just the name when regionless. */
export function voiceLabel(voice: SpeechSynthesisVoice): string {
  const region = regionSubtag(voice.lang);
  const regionName = region ? displayRegion(region) : "";
  return regionName ? `${regionName} — ${voice.name}` : voice.name;
}

// --- available-voice cache + subscription -----------------------------------
// getVoices() may be empty until `voiceschanged` fires (Chrome). We cache the
// last list and notify subscribers (the settings page + the speak buttons)
// through useSyncExternalStore, returning a stable array reference between
// refreshes so React doesn't loop.

let cache: SpeechSynthesisVoice[] = [];
const listeners = new Set<() => void>();
let inited = false;

function refresh(): void {
  const synth = getSynth();
  cache = synth ? synth.getVoices() : [];
  listeners.forEach((l) => l());
}

function ensureInit(): void {
  if (inited) return;
  inited = true;
  const synth = getSynth();
  if (!synth) return;
  refresh();
  // addEventListener is the modern API; guard for older engines exposing only
  // the onvoiceschanged property.
  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", refresh);
  } else if ("onvoiceschanged" in synth) {
    (synth as SpeechSynthesis).onvoiceschanged = refresh;
  }
}

/** The voices installed on this device (stable reference between refreshes). */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  ensureInit();
  return cache;
}

/** Subscribe to voice-list changes; returns an unsubscribe fn. */
export function subscribeVoices(cb: () => void): () => void {
  ensureInit();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Available voices for one language code (chosen from the live device list). */
export const voicesForLang = (code: string): SpeechSynthesisVoice[] =>
  matchVoices(getAvailableVoices(), code);

/** The voice the engine would use for `code` right now, honouring the store. */
export const pickVoice = (
  code: string,
  chosenURI?: string,
): SpeechSynthesisVoice | undefined =>
  chooseVoice(getAvailableVoices(), code, chosenURI);

// --- speaking ---------------------------------------------------------------

/**
 * Speak `text` in the voice chosen for language `code`. A no-op when speech is
 * unsupported or the text is blank. Cancels any in-flight utterance first — this
 * both stops an earlier tap and works around an iOS/Safari quirk where a queued
 * utterance can stall.
 *
 * Note this does NOT consult the master on/off toggle: that toggle governs
 * whether the 🔊 buttons appear (see SpeakButton), while the settings page still
 * previews voices through here. So callers that respect the toggle must gate on
 * it themselves, exactly as SpeakButton does.
 */
export function speak(text: string, code: string): void {
  const synth = getSynth();
  if (!synth || !text || !text.trim()) return;
  const prefs = currentVoicePrefs();

  // Everything from here can be rejected by a flaky engine (a stale voice, an
  // iOS quirk); a 🔊 tap must never throw, so guard the whole sequence.
  try {
    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(code, prefs.byLang[code]);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      // No installed voice matched — hand the browser the language and let it
      // use its own default for it (some engines still read it aloud).
      u.lang = code;
    }
    u.rate = clampRate(prefs.rate);

    synth.speak(u);
  } catch {
    /* ignore — nothing we can do if the engine rejects the utterance */
  }
}

/** Stop anything currently being spoken. */
export function stopSpeaking(): void {
  try {
    getSynth()?.cancel();
  } catch {
    /* ignore */
  }
}
