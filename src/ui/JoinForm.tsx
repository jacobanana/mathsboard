// The join-a-board form (display name + code/link + Join button), shared by
// the welcome screen and the toolbar's Join dialog. Accepts the short code in
// any case/dash format, a pasted share link, or a legacy long board id
// (normalizeBoardCode). Joining swaps the current session for the shared
// board; the host modal closes itself via onJoined.

import { useState } from "react";
import { useBoardStore } from "@/board/store";
import { getStoredName, setStoredName } from "@/collab/profile";
import { normalizeBoardCode } from "@/collab/session";

interface JoinFormProps {
  /** Called once the join has kicked off (close the host modal). */
  onJoined: () => void;
  /** Gate submission (e.g. while the app is still loading the draft). */
  disabled?: boolean;
  /** Focus the code input on mount (the welcome screen focuses Continue). */
  autoFocus?: boolean;
}

export function JoinForm({
  onJoined,
  disabled,
  autoFocus,
}: JoinFormProps): JSX.Element {
  const joinBoard = useBoardStore((s) => s.joinBoard);

  const [name, setName] = useState(getStoredName() ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || !code.trim() || busy || disabled) return;
    const target = normalizeBoardCode(code);
    if (!target) {
      setError("That code doesn't look right — check it and try again.");
      return;
    }
    setStoredName(trimmed);
    setBusy(true);
    setError("");
    try {
      await joinBoard(target);
      onJoined();
    } catch {
      setError("Could not join — is the server reachable?");
    } finally {
      setBusy(false);
    }
  };

  const submitOnEnter = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <>
      <div className="namefield">
        <input
          type="text"
          value={name}
          placeholder="Your name"
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={submitOnEnter}
        />
      </div>
      <div className="joinrow">
        <input
          type="text"
          value={code}
          placeholder="Code or link, e.g. 4F2A-9C1B"
          autoFocus={autoFocus}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={submitOnEnter}
        />
        <button
          className="btn"
          id="joinGo"
          disabled={!name.trim() || !code.trim() || busy || disabled}
          onClick={() => void submit()}
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      <p className="err">{error}</p>
    </>
  );
}
