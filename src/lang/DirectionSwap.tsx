// THE ONE DIRECTION CONTROL — "this side → that side", flipped in one click.
//
// Shared by every place that orients a language pair: the new-board picker
// (which side you speak vs. learn) and the widget dialogs (which side a card /
// sentence shows first). Presentational only — the caller owns the two sides and
// what a swap means, so the same control reads "I speak → Learning" on a new
// board and "Front → Back" on a flash-cards dialog. The languages shown are
// whatever the caller passes, which it derives from the pack's own languages
// (via languageByCode), so the control always names the real languages in play.

import { languageByCode } from "@/lang/data";

/** One side of the pair: its flag and display name. */
export interface DirectionSide {
  flag: string;
  name: string;
}

/** The flag + name for each side of a { known, learning } pair, looked up from
 *  the loaded languages so the control names the pack's actual languages. Falls
 *  back to the raw code if a language somehow isn't in the catalogue. */
export function pairSides(pair: { known: string; learning: string }): {
  known: DirectionSide;
  learning: DirectionSide;
} {
  const side = (code: string): DirectionSide => {
    const l = languageByCode(code);
    return { flag: l?.flag ?? "", name: l?.name ?? code };
  };
  return { known: side(pair.known), learning: side(pair.learning) };
}

interface DirectionSwapProps {
  /** Small uppercase label over the left side (e.g. "I speak", "Front"). */
  leftRole: string;
  /** Small uppercase label over the right side (e.g. "Learning", "Back"). */
  rightRole: string;
  left: DirectionSide;
  right: DirectionSide;
  onSwap(): void;
  /** Tooltip / aria-label for the swap button. */
  swapTitle?: string;
}

export function DirectionSwap({
  leftRole,
  rightRole,
  left,
  right,
  onSwap,
  swapTitle = "Swap direction",
}: DirectionSwapProps): JSX.Element {
  return (
    <div className="lang-dir">
      <div className="lang-dir-side">
        <span className="lang-dir-role">{leftRole}</span>
        <span className="lang-dir-lang">
          <span className="lang-dir-flag" aria-hidden>
            {left.flag}
          </span>
          {left.name}
        </span>
      </div>
      <button
        type="button"
        className="lang-dir-swap"
        onClick={onSwap}
        title={swapTitle}
        aria-label={swapTitle}
      >
        ⇄
      </button>
      <div className="lang-dir-side">
        <span className="lang-dir-role">{rightRole}</span>
        <span className="lang-dir-lang">
          <span className="lang-dir-flag" aria-hidden>
            {right.flag}
          </span>
          {right.name}
        </span>
      </div>
    </div>
  );
}
