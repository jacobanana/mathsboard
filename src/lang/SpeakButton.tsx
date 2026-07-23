// A small 🔊 "tap to say it" button, dropped next to any word or sentence on the
// language board. It speaks `text` in the voice chosen for language `code`
// (see lang/speech.ts) and renders nothing when the browser can't synthesise
// speech or the learner has turned speech off — so callers add it unconditionally
// and it simply disappears where it can't work.
//
// It stops pointer/click propagation so tapping it never drags the card it sits
// on or toggles the row it sits in. Inside another interactive element (the
// langmatch word nodes, the langphrases rows — themselves <button>s), pass
// as="span" to avoid nesting a <button> in a <button>, which is invalid HTML.

import { speak, speechSupported } from "@/lang/speech";
import { useVoiceStore } from "@/lang/voiceStore";

export interface SpeakButtonProps {
  /** The exact text to speak. */
  text: string;
  /** The language code the text is in (ISO 639-1, e.g. "fr"). */
  code: string;
  /** Tooltip; defaults to "Listen". */
  title?: string;
  /** Element to render. Use "span" when nested inside another button. */
  as?: "button" | "span";
  /** Extra class names appended to `.lang-speak`. */
  className?: string;
}

export function SpeakButton({
  text,
  code,
  title = "Listen",
  as = "button",
  className,
}: SpeakButtonProps): JSX.Element | null {
  const enabled = useVoiceStore((s) => s.enabled);
  if (!enabled || !speechSupported() || !text.trim()) return null;

  const cls = "lang-speak" + (className ? " " + className : "");
  const say = () => speak(text, code);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const icon = (
    <span className="lang-speak-ico" aria-hidden>
      🔊
    </span>
  );

  if (as === "span") {
    return (
      <span
        className={cls}
        role="button"
        tabIndex={0}
        title={title}
        aria-label={title}
        onPointerDown={stop}
        onClick={(e) => {
          e.stopPropagation();
          say();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            say();
          }
        }}
      >
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      title={title}
      aria-label={title}
      onPointerDown={stop}
      onClick={(e) => {
        e.stopPropagation();
        say();
      }}
    >
      {icon}
    </button>
  );
}
