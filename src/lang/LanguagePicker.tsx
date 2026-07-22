// The "I know / I want to learn" chooser shown on the language board's welcome
// screen. It reads and writes the persisted language pair (lang/store); NEW
// widgets seed themselves from the current pair, so switching here changes what
// the next flash-cards / match / sentence activity is created in (already-placed
// activities keep the languages they were made with — they bake them in).

import { LANGUAGES } from "@/lang/data";
import { useLangStore } from "@/lang/store";

export function LanguagePicker(): JSX.Element {
  const pair = useLangStore((s) => s.pair);
  const setKnown = useLangStore((s) => s.setKnown);
  const setLearning = useLangStore((s) => s.setLearning);

  return (
    <div className="lang-picker">
      <label className="lang-pick">
        <span className="lang-pick-label">I speak</span>
        <select value={pair.known} onChange={(e) => setKnown(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.name}
            </option>
          ))}
        </select>
      </label>
      <span className="lang-arrow" aria-hidden>
        →
      </span>
      <label className="lang-pick">
        <span className="lang-pick-label">I want to learn</span>
        <select value={pair.learning} onChange={(e) => setLearning(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} disabled={l.code === pair.known}>
              {l.flag} {l.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
