// A word (or short phrase) that speaks itself when tapped — the WHOLE word is
// the hit target, unlike the small round SpeakButton that sits beside it. On a
// big flip card or a dense list the tiny 🔊 button is fiddly to hit; making the
// word the button fixes that. A faint speaker glyph trails the word as an
// affordance so it reads as "tap to hear".
//
// It degrades gracefully: when the browser can't synthesise speech or the
// learner has turned speech off, it renders as a plain, non-interactive element
// (the same text), so callers can drop it in unconditionally.
//
// Like SpeakButton it stops pointer/click propagation, so tapping it never drags
// the card it sits on or toggles the row it lives in.

import { speak, speechSupported } from "@/lang/speech";
import { useVoiceStore } from "@/lang/voiceStore";

export interface SpokenWordProps {
  /** The exact text to say (and show). */
  text: string;
  /** The language code the text is in (ISO 639-1, e.g. "fr"). */
  code: string;
  /** Extra class names appended to `.spoken-word`. */
  className?: string;
  /** Tooltip; defaults to "Tap to listen". */
  title?: string;
  /** Show the trailing 🔊 affordance (default true). */
  icon?: boolean;
}

export function SpokenWord({
  text,
  code,
  className,
  title = "Tap to listen",
  icon = true,
}: SpokenWordProps): JSX.Element {
  const enabled = useVoiceStore((s) => s.enabled);
  const canSpeak = enabled && speechSupported() && !!text.trim();
  const cls = "spoken-word" + (className ? " " + className : "");

  if (!canSpeak) {
    return <span className={cls}>{text}</span>;
  }

  return (
    <button
      type="button"
      className={cls + " speakable"}
      title={title}
      aria-label={`${title}: ${text}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        speak(text, code);
      }}
    >
      <span className="spoken-word-txt">{text}</span>
      {icon && (
        <span className="spoken-word-ico" aria-hidden>
          🔊
        </span>
      )}
    </button>
  );
}
