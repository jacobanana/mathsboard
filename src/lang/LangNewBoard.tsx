// The "new board" language step (language board only). Creating a new board is
// a natural moment to choose the languages, so the New-board action routes here
// first: pick the pair, then Start creates the fresh board. Picking here updates
// the same persisted pair the widgets seed from (lang/store).

import { LanguagePicker } from "@/lang/LanguagePicker";

interface LangNewBoardProps {
  /** Create the new board (host wires this to store.newBoard) and close. */
  onStart: () => void;
  onCancel: () => void;
}

export function LangNewBoard({ onStart, onCancel }: LangNewBoardProps): JSX.Element {
  return (
    <>
      <h2>New board</h2>
      <p className="hint">Choose the languages for this board.</p>

      <LanguagePicker />

      <div className="card-actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={onStart}>
          Start
        </button>
      </div>
    </>
  );
}
