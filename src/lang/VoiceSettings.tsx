// THE VOICES SETTINGS PAGE (language board only, burger menu → "Voices"). It
// lets the learner choose, per language, WHICH installed voice speaks it — so
// French words are read with a French voice, and Portuguese can be set to a
// Portugal or a Brazil voice — plus a global speaking speed and a master on/off
// for the 🔊 tap-to-speak buttons.
//
// The actual engine lives in lang/speech.ts (Web Speech API); the chosen voices
// live in lang/voiceStore.ts. This file is just the view + wiring. The available
// voices come from the device's OS and load asynchronously (Chrome fires
// `voiceschanged` after first paint), so the list is driven through
// useSyncExternalStore and updates live as voices arrive or the user installs a
// new one. Languages come from the loaded content packs, so importing a pack
// that adds a language makes a new row appear here too.

import { useSyncExternalStore } from "react";
import { LANGUAGES } from "@/lang/data";
import { subscribeContent } from "@/lang/content/registry";
import {
  getAvailableVoices,
  speak,
  speechSupported,
  subscribeVoices,
  voiceLabel,
  voicesForLang,
} from "@/lang/speech";
import {
  MAX_RATE,
  MIN_RATE,
  useVoiceStore,
} from "@/lang/voiceStore";

/** A short, natural sample per language so a Test click actually shows the
 *  accent. Falls back to the language's own name for languages not listed. */
const SAMPLES: Record<string, string> = {
  en: "Hello, how are you today?",
  fr: "Bonjour, comment ça va ?",
  es: "Hola, ¿cómo estás hoy?",
  pt: "Olá, tudo bem com você?",
  de: "Hallo, wie geht es dir?",
  it: "Ciao, come stai oggi?",
  nl: "Hallo, hoe gaat het met je?",
};

export function VoiceSettings(): JSX.Element {
  // Re-render when the device's voice list changes (loads late / user installs
  // one), and when content packs change the set of languages.
  useSyncExternalStore(subscribeVoices, getAvailableVoices);
  useSyncExternalStore(subscribeContent, () => LANGUAGES.map((l) => l.code).join(","));

  const enabled = useVoiceStore((s) => s.enabled);
  const rate = useVoiceStore((s) => s.rate);
  const byLang = useVoiceStore((s) => s.byLang);
  const setEnabled = useVoiceStore((s) => s.setEnabled);
  const setRate = useVoiceStore((s) => s.setRate);
  const setVoice = useVoiceStore((s) => s.setVoice);

  const sampleFor = (code: string, nativeName: string): string =>
    SAMPLES[code] ?? nativeName;

  if (!speechSupported()) {
    return (
      <div className="about voice-settings">
        <h2>Voices</h2>
        <p className="vs-note">
          This browser can’t read text aloud. Tap-to-speak needs the Web Speech
          API, which is missing here (for example on Firefox for Android). Try
          Chrome, Edge, or Safari to hear the words and sentences.
        </p>
      </div>
    );
  }

  return (
    <div className="about voice-settings">
      <h2>Voices</h2>
      <p>
        Tap the 🔊 on any word or sentence to hear it. Choose which voice reads
        each language below — for Portuguese, for instance, you can pick a
        Portugal or a Brazil voice.
      </p>

      <label className="vs-master">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>Show 🔊 tap-to-speak buttons</span>
      </label>

      <div className="vs-rate">
        <label htmlFor="vs-rate-input">Speaking speed</label>
        <input
          id="vs-rate-input"
          type="range"
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.05}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
        <span className="vs-rate-val">{rate.toFixed(2)}×</span>
      </div>

      <div className="vs-list">
        {LANGUAGES.map((lang) => {
          const voices = voicesForLang(lang.code);
          const chosen = byLang[lang.code] ?? "";
          const sample = sampleFor(lang.code, lang.nativeName);
          return (
            <div className="vs-row" key={lang.code}>
              <span className="vs-lang">
                <span className="vs-flag" aria-hidden>
                  {lang.flag}
                </span>
                <span className="vs-name">{lang.name}</span>
              </span>

              <select
                className="vs-select"
                value={chosen}
                disabled={voices.length === 0}
                onChange={(e) => setVoice(lang.code, e.target.value)}
              >
                <option value="">Device default</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {voiceLabel(v)}
                  </option>
                ))}
              </select>

              <button
                className="vs-test"
                title={`Hear ${lang.name}`}
                onClick={() => speak(sample, lang.code)}
              >
                ▶ Test
              </button>

              {voices.length === 0 && (
                <span className="vs-missing">
                  No {lang.name} voice installed on this device — it may still be
                  read with a default, or add one in your system settings.
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="vs-note">
        Voices come from your device, so the list differs by device and browser.
        Your choices are saved on this device only.
      </p>
    </div>
  );
}
