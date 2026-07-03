// The Share dialog (card body only; the host wraps it in <Modal>).
//
//   solo   -> explain + name field + "Start sharing": mints a fresh board id,
//             seeds the shared session with the CURRENT board content, puts
//             ?board=<id> in the URL and shows the copyable link.
//   shared -> the share link + copy button, a connection-status line, the
//             "who's here" list (self + peers), and "Leave board" (keeps the
//             current content as the private local draft).

import { useState } from "react";
import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { getStoredName, setStoredName } from "@/collab/profile";
import { shareLink } from "@/collab/session";
import type { CollabStatus } from "@/collab/collabStore";

const STATUS_LABEL: Record<CollabStatus, string> = {
  connected: "Live — changes sync instantly",
  handshaking: "Connecting…",
  connecting: "Connecting…",
  error: "Connection lost — retrying. Your edits are kept and will sync.",
  offline: "Offline",
};

export function ShareModal({ onClose }: { onClose: () => void }): JSX.Element {
  const mode = useCollabStore((s) => s.mode);
  const status = useCollabStore((s) => s.status);
  const peers = useCollabStore((s) => s.peers);
  const self = useCollabStore((s) => s.self);
  const shareBoard = useBoardStore((s) => s.shareBoard);
  const leaveBoard = useBoardStore((s) => s.leaveBoard);

  const [name, setName] = useState(getStoredName() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const startSharing = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setStoredName(trimmed);
    setBusy(true);
    setError("");
    try {
      await shareBoard();
    } catch {
      setError("Could not start sharing — is the server reachable?");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (permissions); the input below is selectable.
    }
  };

  if (mode !== "shared") {
    return (
      <>
        <h2>Share this board</h2>
        <p className="hint">
          Anyone with the link joins this board and you edit it together live.
          Pick the name others will see next to your cursor.
        </p>
        <div className="namefield">
          <input
            type="text"
            value={name}
            placeholder="Your name"
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void startSharing();
              }
            }}
            autoFocus
          />
        </div>
        <p className="err">{error}</p>
        <div className="card-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!name.trim() || busy}
            onClick={() => void startSharing()}
          >
            {busy ? "Starting…" : "Start sharing"}
          </button>
        </div>
      </>
    );
  }

  const link = shareLink();
  return (
    <>
      <h2>Board is shared</h2>
      <p className="hint">Send this link — opening it joins the board.</p>
      <div className="share-linkrow">
        <input
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="btn primary" onClick={() => void copy()}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <p className={"share-status share-status-" + status}>
        <span className="share-dot" />
        {STATUS_LABEL[status]}
      </p>

      <div className="subhead">Here now ({peers.length + 1})</div>
      <div className="share-people">
        {self && (
          <span className="share-person" style={{ background: self.color }}>
            {self.name} (you)
          </span>
        )}
        {peers.map((p) => (
          <span
            key={p.clientId}
            className="share-person"
            style={{ background: p.color }}
          >
            {p.name}
          </span>
        ))}
      </div>

      <div className="card-actions">
        <button
          className="btn"
          title="Disconnect from this board; what's on screen stays as your local draft"
          onClick={() => {
            leaveBoard();
            onClose();
          }}
        >
          Leave board
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );
}
