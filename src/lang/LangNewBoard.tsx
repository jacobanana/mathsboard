// The "new board" flow (language board only). Creating a board ALWAYS runs the
// same two steps: first WHICH LANGUAGE it teaches (and the direction), then
// WHICH CONTENT it teaches from — only the packs covering the chosen languages
// are offered, several can be combined, and more can be loaded without leaving
// the flow. The choice becomes the board's own content setup (stamped onto the
// document by store.newBoard), so nothing is committed if the learner cancels
// at either step and the board keeps teaching it after a save or a share.

import { useState } from "react";
import type { BoardContentSetup } from "@/board/types";
import {
  PackLanguageStep,
  PackContentStep,
  usePackDirection,
} from "@/lang/PackDirectionPicker";

interface LangNewBoardProps {
  /** Open the content manager (load, create, delete) from the content step. */
  onManageContent?: () => void;
  /** Create the new board with the chosen content (host wires this to
   *  store.newBoard, which stamps the setup onto the document) and close. */
  onStart: (setup: BoardContentSetup) => void;
  onCancel: () => void;
}

export function LangNewBoard({
  onStart,
  onCancel,
  onManageContent,
}: LangNewBoardProps): JSX.Element {
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

      <PackContentStep dir={dir} onManage={onManageContent} />

      <div className="card-actions">
        <button className="btn" onClick={() => setStep("language")}>
          Back
        </button>
        <button
          className="btn primary"
          disabled={!dir.canStart}
          onClick={() => onStart(dir.setup())}
        >
          Start
        </button>
      </div>
    </>
  );
}
