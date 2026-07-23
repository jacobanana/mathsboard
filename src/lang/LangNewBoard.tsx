// The "new board" flow (language board only). Creating a board ALWAYS runs the
// same two steps: first WHICH LANGUAGE it teaches (and the direction), then
// WHICH CONTENT to load for it — only the packs covering the chosen languages
// are offered. The choice is applied to the content registry's active packs
// and the persisted language pair that new widgets seed from — so nothing is
// committed if the learner cancels at either step.

import { useState } from "react";
import {
  PackLanguageStep,
  PackContentStep,
  usePackDirection,
} from "@/lang/PackDirectionPicker";

interface LangNewBoardProps {
  /** Create the new board (host wires this to store.newBoard) and close. */
  onStart: () => void;
  onCancel: () => void;
}

export function LangNewBoard({ onStart, onCancel }: LangNewBoardProps): JSX.Element {
  const dir = usePackDirection();
  const [step, setStep] = useState<"language" | "content">("language");

  if (step === "language") {
    return (
      <>
        <h2>New board</h2>
        <p className="hint">Which language is this board for?</p>

        <PackLanguageStep dir={dir} />

        <div className="card-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={dir.group == null}
            onClick={() => setStep("content")}
          >
            Next: choose content
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>New board</h2>
      <p className="hint">Choose the content this board teaches from.</p>

      <PackContentStep dir={dir} />

      <div className="card-actions">
        <button className="btn" onClick={() => setStep("language")}>
          Back
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
