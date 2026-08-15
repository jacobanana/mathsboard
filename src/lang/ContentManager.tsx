// THE CONTENT MANAGER (language board only, burger menu → "Content").
//
// ONE place for everything to do with what the board teaches, in three tabs:
//
//   • THIS BOARD — the languages and packs the OPEN board teaches from, tickable
//     (several packs of the same languages combine). BoardContentPanel.
//   • LIBRARY    — every pack on this device, plus anything the open board
//     brought with it: view, download, delete, save-to-library. ContentLibrary.
//   • CREATE     — make your own pack: the format, an LLM prompt, and loading
//     the finished file. ContentStudio.
//
// The manager owns the parts the three tabs share: the "Load content…" button
// and its file input, one feedback banner, and the pack viewer (ContentReview),
// which takes over the whole card so a pack can be read at full width from
// wherever it was opened.
//
// This replaces the old split between a "Contents" page and a separate "Create
// content" page, which left no single answer to "where do I manage my content?".

import { useRef, useState } from "react";
import { BoardContentPanel } from "@/lang/BoardContentPanel";
import { ContentLibrary } from "@/lang/ContentLibrary";
import { ContentReview } from "@/lang/ContentReview";
import { ContentStudio } from "@/lang/ContentStudio";
import { importPackFiles } from "@/lang/content/files";
import { currentSetup, setupOf, withPacks } from "@/lang/content/boardContent";
import { useBoardStore } from "@/board/store";
import type { ContentPack } from "@/lang/content/schema";

/** Which tab the manager opens on. */
export type ContentTab = "board" | "library" | "create";

const TABS: { id: ContentTab; label: string }[] = [
  { id: "board", label: "This board" },
  { id: "library", label: "Library" },
  { id: "create", label: "Create" },
];

type Feedback =
  | { kind: "ok"; message: string }
  | { kind: "error"; messages: string[] }
  | null;

export interface ContentManagerProps {
  /** Tab to open on — the menu opens the library, the board flows open "This
   *  board", "Create your own content" opens Create. */
  initialTab?: ContentTab;
}

export function ContentManager({ initialTab = "board" }: ContentManagerProps): JSX.Element {
  const [tab, setTab] = useState<ContentTab>(initialTab);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [review, setReview] = useState<ContentPack | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const { added, packs, errors } = await importPackFiles(files);
    if (errors.length) {
      setFeedback({ kind: "error", messages: errors });
    } else {
      // Loading content from THIS BOARD's tab means "teach from this here", so
      // put the new packs straight on the board when they fit its languages.
      // From the other tabs it is a library operation and the board is left
      // alone — the message says which happened.
      const onBoard = tab === "board" ? putOnBoard(packs) : 0;
      const what = `${added} pack${added === 1 ? "" : "s"}`;
      setFeedback({
        kind: "ok",
        message:
          onBoard > 0
            ? `Loaded ${what} — now teaching on this board.`
            : `Loaded ${what} into your library — tick it under “This board” to teach from it.`,
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const load = (): void => fileRef.current?.click();

  /** Put freshly loaded packs on the open board, where their languages allow.
   *  Returns how many joined it. */
  function putOnBoard(packs: ContentPack[]): number {
    const store = useBoardStore.getState();
    const setup = setupOf(store.board) ?? currentSetup();
    const next = withPacks(setup, packs);
    if (!next) return 0;
    store.setBoardContent(next);
    return next.packIds.length - setup.packIds.length;
  }

  // Reading a pack takes the whole card: the lists are a means to get here.
  if (review) {
    return (
      <ContentReview
        source={review}
        title={review.name}
        onBack={() => setReview(null)}
      />
    );
  }

  return (
    <div className="about content-manager">
      <div className="cl-head">
        <div>
          <h1>Content</h1>
          <p className="hint">
            Choose what this board teaches, manage the packs on this device, or
            create your own.
          </p>
        </div>
        <button className="btn primary cl-load" onClick={load}>
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

      <div className="cm-tabs" role="tablist" aria-label="Content">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`contentTab-${t.id}`}
            aria-selected={tab === t.id}
            className={"cm-tab" + (tab === t.id ? " active" : "")}
            onClick={() => {
              setTab(t.id);
              setFeedback(null); // last tab's message doesn't belong on this one
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {feedback?.kind === "ok" && <p className="cs-ok">{feedback.message}</p>}
      {feedback?.kind === "error" && (
        <div className="cs-errors">
          <strong>Couldn&rsquo;t load:</strong>
          <ul>
            {feedback.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === "board" && <BoardContentPanel onReview={setReview} />}
      {tab === "library" && (
        <ContentLibrary
          onReview={setReview}
          onMessage={(message) => setFeedback({ kind: "ok", message })}
          onErrors={(messages) => setFeedback({ kind: "error", messages })}
        />
      )}
      {tab === "create" && <ContentStudio onLoad={load} />}
    </div>
  );
}
