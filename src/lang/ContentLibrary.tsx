// "LIBRARY" — everything this device can teach from, as a list you can manage.
//
// One row per pack: the built-in one, everything you've loaded, and anything the
// OPEN BOARD brought with it that isn't in your library yet (those lead, in
// their own highlighted section, because they teach here already and are one
// click from being yours). Each row says what the pack holds, whether it is on
// the open board, and offers View / Download / Delete.
//
// Loading content and creating it live on the other tabs of the same manager
// (ContentManager); this tab is the inventory. Copy never mentions the file
// format — teachers load "content", not JSON.

import { useSyncExternalStore } from "react";
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
import { downloadPack } from "@/lang/content/files";
import { packSummary } from "@/lang/content/boardContent";
import type { ContentPack } from "@/lang/content/schema";

interface PackRowProps {
  pack: ContentPack;
  /** Small status badges after the name ("built-in", "on this board"). */
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
  /** Open a pack's contents (the shared review view). */
  onReview(pack: ContentPack): void;
  /** Report the outcome of an action through the manager's shared banner. */
  onMessage(message: string): void;
  /** Errors from an action, same banner. */
  onErrors(messages: string[]): void;
}

export function ContentLibrary({
  onReview,
  onMessage,
  onErrors,
}: ContentLibraryProps): JSX.Element {
  // Re-render on any registry change — loads, deletions, and the open board's
  // own packs — so the lists and badges stay live.
  useSyncExternalStore(subscribeContent, () =>
    [
      `base:${isBaseActive() ? 1 : 0}`,
      ...importedPacks().map((p) => `${p.id}:${isPackActive(p.id) ? 1 : 0}`),
      ...boardPacksNow().map((p) => `board:${p.id}`),
    ].join(","),
  );

  const packs = importedPacks();
  // Packs the open board carries that aren't in this device's library yet.
  const fromBoard = boardPacksNow();

  function saveFromBoard(pack: ContentPack): void {
    const r = importPackJson(JSON.stringify(pack));
    if (r.ok) onMessage(`Saved “${pack.name}” to your library.`);
    else onErrors(r.errors);
  }

  return (
    <>
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
                badges={["on this board"]}
                onView={() => onReview(p)}
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
          badges={["built-in", ...(isBaseActive() ? ["on this board"] : [])]}
          onView={() => onReview(BASE_PACK)}
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
            badges={isPackActive(p.id) ? ["on this board"] : []}
            onView={() => onReview(p)}
            actions={
              <>
                <button className="btn small" onClick={() => downloadPack(p)}>
                  Download
                </button>
                <button
                  className="btn small cs-remove"
                  onClick={() => {
                    removeImportedPack(p.id);
                    onMessage(
                      `Deleted “${p.name}”. Loading its file again brings it back.`,
                    );
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
        The built-in content can&rsquo;t be deleted. Content carried by a board
        stays with that board even if it isn&rsquo;t in your library. Choose what
        the open board teaches from on the <b>This board</b> tab.
      </p>
    </>
  );
}
