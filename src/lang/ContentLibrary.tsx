// THE CONTENTS SETTINGS PAGE (language board only, burger menu → "Contents").
// The one place to see everything this device can teach from and manage it:
//
//   • Content carried by the OPEN BOARD that isn't in your library yet leads,
//     in its own highlighted section — it already teaches on this board, and
//     one click saves it for your own boards.
//   • Your library below: the built-in pack and every pack you've loaded, each
//     with what it contains, whether it's teaching on this board, and View /
//     Download / Delete actions.
//   • "Load content…" imports pack files (validated by the registry).
//
// Creating NEW content lives on its own page (ContentStudio); this page links
// to it. Copy never mentions the file format — teachers load "content", not
// JSON.

import { useRef, useState, useSyncExternalStore } from "react";
import {
  BASE_PACK,
  boardPacksNow,
  importPackJson,
  importedPacks,
  isBaseActive,
  isPackActive,
  removeImportedPack,
  subscribeContent,
} from "@/lang/content/registry";
import { downloadPack, importPackFiles } from "@/lang/content/files";
import type { ContentPack } from "@/lang/content/schema";
import { ContentReview, type ReviewSource } from "@/lang/ContentReview";

/** What a pack holds, in words a teacher scans: "240 words · 60 sentences · 18 verbs". */
function packSummary(p: ContentPack): string {
  const n = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  return `${n(p.vocab.length, "word")} · ${n(p.sentences.length, "sentence")} · ${n(p.verbs.length, "verb")}`;
}

type Feedback =
  | { kind: "ok"; message: string }
  | { kind: "error"; messages: string[] }
  | null;

interface PackRowProps {
  pack: ContentPack;
  /** Small status badges after the name ("built-in", "teaching on this board"). */
  badges: string[];
  onView(): void;
  actions: JSX.Element;
}

function PackRow({ pack, badges, onView, actions }: PackRowProps): JSX.Element {
  return (
    <li>
      <span className="cs-pack-name cl-pack-main">
        <span>
          {pack.name}{" "}
          <span className="cs-pack-langs" title="Languages this pack teaches">
            {pack.languages.map((l) => l.flag).join(" ")}
          </span>{" "}
          {badges.map((b) => (
            <span key={b} className="cs-badge">
              {b}
            </span>
          ))}
        </span>
        <span className="cl-pack-counts">{packSummary(pack)}</span>
      </span>
      <span className="cs-pack-actions">
        <button className="btn small" onClick={onView}>
          View
        </button>
        {actions}
      </span>
    </li>
  );
}

export interface ContentLibraryProps {
  /** Open the content-creation page (make your own pack). */
  onCreate?: () => void;
}

export function ContentLibrary({ onCreate }: ContentLibraryProps): JSX.Element {
  // Re-render on any registry change — imports, removals, toggles, and the
  // open board's own packs — so the lists and badges stay live.
  useSyncExternalStore(subscribeContent, () =>
    [
      `base:${isBaseActive() ? 1 : 0}`,
      ...importedPacks().map((p) => `${p.id}:${isPackActive(p.id) ? 1 : 0}`),
      ...boardPacksNow().map((p) => `board:${p.id}`),
    ].join(","),
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [review, setReview] = useState<{ source: ReviewSource; title: string } | null>(null);

  const packs = importedPacks();
  // Packs the open board carries that aren't in this device's library yet.
  const fromBoard = boardPacksNow();

  if (review) {
    return (
      <ContentReview
        source={review.source}
        title={review.title}
        onBack={() => setReview(null)}
      />
    );
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const { added, errors } = await importPackFiles(files);
    if (errors.length) setFeedback({ kind: "error", messages: errors });
    else
      setFeedback({
        kind: "ok",
        message: `Loaded ${added} pack${added === 1 ? "" : "s"} — ready to use on your boards.`,
      });
    if (fileRef.current) fileRef.current.value = "";
  }

  function saveFromBoard(pack: ContentPack): void {
    const r = importPackJson(JSON.stringify(pack));
    setFeedback(
      r.ok
        ? { kind: "ok", message: `Saved "${pack.name}" to your library.` }
        : { kind: "error", messages: r.errors },
    );
  }

  return (
    <div className="about content-library">
      <div className="cl-head">
        <div>
          <h1>Contents</h1>
          <p className="hint">
            Every pack this device can teach from. Load new content, see what's
            inside, download a pack to share it, and delete the ones you no
            longer need.
          </p>
        </div>
        <button className="btn primary cl-load" onClick={() => fileRef.current?.click()}>
          Load content…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {feedback?.kind === "ok" && <p className="cs-ok">{feedback.message}</p>}
      {feedback?.kind === "error" && (
        <div className="cs-errors">
          <strong>Couldn't load:</strong>
          <ul>
            {feedback.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {fromBoard.length > 0 && (
        <div className="cl-board-section">
          <h2>
            Content in this board <span className="cs-badge">not in your library</span>
          </h2>
          <p className="hint">
            The open board brought this content with it — it already teaches
            here. Save it to reuse it in your own boards.
          </p>
          <ul className="cs-packs">
            {fromBoard.map((p) => (
              <PackRow
                key={p.id}
                pack={p}
                badges={["teaching on this board"]}
                onView={() => setReview({ source: p, title: p.name })}
                actions={
                  <button className="btn small" onClick={() => saveFromBoard(p)}>
                    Save to my library
                  </button>
                }
              />
            ))}
          </ul>
        </div>
      )}

      <h2>Your library</h2>
      <ul className="cs-packs">
        <PackRow
          pack={BASE_PACK}
          badges={["built-in", ...(isBaseActive() ? ["teaching on this board"] : [])]}
          onView={() => setReview({ source: BASE_PACK, title: BASE_PACK.name })}
          actions={
            <button className="btn small" onClick={() => downloadPack(BASE_PACK)}>
              Download
            </button>
          }
        />
        {packs.map((p) => (
          <PackRow
            key={p.id}
            pack={p}
            badges={isPackActive(p.id) ? ["teaching on this board"] : []}
            onView={() => setReview({ source: p, title: p.name })}
            actions={
              <>
                <button className="btn small" onClick={() => downloadPack(p)}>
                  Download
                </button>
                <button
                  className="btn small cs-remove"
                  onClick={() => {
                    removeImportedPack(p.id);
                    setFeedback({
                      kind: "ok",
                      message: `Deleted "${p.name}". Loading its file again brings it back.`,
                    });
                  }}
                >
                  Delete
                </button>
              </>
            }
          />
        ))}
      </ul>
      <p className="hint">
        The built-in content can't be deleted. Content carried by a board stays
        with that board even if it isn't in your library.
      </p>

      {onCreate && (
        <p>
          <button className="btn cl-create-link" onClick={onCreate}>
            Create your own content →
          </button>
        </p>
      )}
    </div>
  );
}
