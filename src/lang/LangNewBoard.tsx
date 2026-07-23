// The "new board" language step (language board only). Creating a new board is
// a natural moment to choose WHAT it teaches, so the New-board action routes
// here first: pick a language pack (or several sharing the same languages) and
// the direction, then Start creates the fresh board. The choice is applied to
// the content registry's active packs and the persisted language pair that new
// widgets seed from — so nothing is committed if the learner cancels.

import { PackDirectionPicker, usePackDirection } from "@/lang/PackDirectionPicker";

interface LangNewBoardProps {
  /** Create the new board (host wires this to store.newBoard) and close. */
  onStart: () => void;
  onCancel: () => void;
}

export function LangNewBoard({ onStart, onCancel }: LangNewBoardProps): JSX.Element {
  const dir = usePackDirection();

  return (
    <>
      <h2>New board</h2>
      <p className="hint">Choose a pack and which way you're learning.</p>

      <PackDirectionPicker dir={dir} />

      <div className="card-actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!dir.canStart}
          onClick={() => {
            dir.apply();
            onStart();
          }}
        >
          Start
        </button>
      </div>
    </>
  );
}
