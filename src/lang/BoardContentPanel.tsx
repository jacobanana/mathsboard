// "THIS BOARD" — the panel that says what the OPEN board teaches, and changes it.
//
// A language board declares its own content (BoardDocument.contentSetup): the
// direction and the packs it teaches from. This is the one screen for editing
// that choice while the board is open:
//
//   • the direction, with a one-click swap;
//   • a tick per pack covering those languages — SEVERAL combine, so a lesson
//     can pull from the built-in content and two of your own packs at once;
//   • packs the board names that aren't on this device, said plainly rather
//     than silently dropped;
//   • switching the board to a different language set, which is a big enough
//     change to sit behind its own disclosure.
//
// Every change goes through store.setBoardContent, so it applies immediately AND
// is recorded on the document — a save keeps it and collaborators get it.

import { useMemo, useState, useSyncExternalStore } from "react";
import { useBoardStore } from "@/board/store";
import type { BoardContentSetup } from "@/board/types";
import { DirectionSwap } from "@/lang/DirectionSwap";
import {
  BASE_ID,
  currentSetup,
  packSummary,
  resolveSetup,
  setupOf,
} from "@/lang/content/boardContent";
import {
  BASE_PACK,
  boardPacksNow,
  importedPacks,
  isPackActive,
  isBaseActive,
  subscribeContent,
} from "@/lang/content/registry";
import { signatureOf } from "@/lang/packDirectory";
import type { ContentPack, PackLanguage } from "@/lang/content/schema";

/** One pack this device could put on a board, with where it came from. */
interface Choice {
  pack: ContentPack;
  isBase: boolean;
  /** Carried by the open board rather than loaded into the library. */
  fromBoard: boolean;
  signature: string;
}

/** Everything pickable right now: the built-in pack, the library, and the packs
 *  the open board brought with it (which teach here whether or not they were
 *  ever loaded into this device's library). */
function allChoices(): Choice[] {
  const seen = new Set<string>();
  const out: Choice[] = [];
  const add = (pack: ContentPack, isBase: boolean, fromBoard: boolean): void => {
    if (seen.has(pack.id)) return;
    seen.add(pack.id);
    out.push({ pack, isBase, fromBoard, signature: signatureOf(pack.languages) });
  };
  add(BASE_PACK, true, false);
  for (const p of importedPacks()) add(p, false, false);
  for (const p of boardPacksNow()) add(p, false, true);
  return out;
}

export interface BoardContentPanelProps {
  /** Open a pack's contents (the shared review view). */
  onReview(pack: ContentPack): void;
}

export function BoardContentPanel({ onReview }: BoardContentPanelProps): JSX.Element {
  const board = useBoardStore((s) => s.board);
  const setBoardContent = useBoardStore((s) => s.setBoardContent);
  // Re-render when the library or the board's own packs change (a load from the
  // header button must show up in the list straight away).
  useSyncExternalStore(subscribeContent, () =>
    [
      isBaseActive() ? "base" : "",
      ...importedPacks().map((p) => `${p.id}:${isPackActive(p.id) ? 1 : 0}`),
      ...boardPacksNow().map((p) => `b:${p.id}`),
    ].join(","),
  );
  const [langOpen, setLangOpen] = useState(false);

  // What the board teaches. A board that has never declared a choice (a blank
  // draft) falls back to what the app is teaching right now, which is exactly
  // what it would be saved with.
  const setup = setupOf(board) ?? currentSetup();
  const choices = allChoices();
  const chosen = new Set(setup.packIds);
  const { missingIds } = resolveSetup(setup);

  // The language set the board is on, and the others it could switch to.
  const signature = useMemo(() => {
    const first = choices.find((c) => chosen.has(c.pack.id));
    return first?.signature ?? signatureOf([{ code: setup.known }, { code: setup.learning }]);
  }, [choices, chosen, setup.known, setup.learning]);

  const groups = useMemo(() => {
    const bySig = new Map<string, { languages: PackLanguage[]; choices: Choice[] }>();
    for (const c of choices) {
      const g = bySig.get(c.signature) ?? { languages: c.pack.languages, choices: [] };
      g.choices.push(c);
      bySig.set(c.signature, g);
    }
    return bySig;
  }, [choices]);

  const here = groups.get(signature)?.choices ?? [];
  const languages = groups.get(signature)?.languages ?? [];
  const langOf = (code: string): { flag: string; name: string } => {
    const l = languages.find((x) => x.code === code);
    return { flag: l?.flag ?? "", name: l?.name ?? code };
  };

  const commit = (next: BoardContentSetup): void => setBoardContent(next);

  function togglePack(id: string): void {
    const next = new Set(setup.packIds);
    if (next.has(id)) {
      if (next.size === 1) return; // a board must teach from something
      next.delete(id);
    } else {
      next.add(id);
    }
    // Keep the ids in a stable, readable order: built-in first, then the rest
    // in the order they are offered.
    const order = [BASE_ID, ...here.map((c) => c.pack.id), ...setup.packIds];
    const packIds: string[] = [];
    for (const packId of order) {
      if (next.has(packId) && !packIds.includes(packId)) packIds.push(packId);
    }
    commit({ ...setup, packIds });
  }

  function switchLanguages(sig: string): void {
    if (sig === signature) return;
    const group = groups.get(sig);
    if (!group) return;
    const codes = group.languages.map((l) => l.code);
    if (codes.length < 2) return;
    // Keep the side the learner speaks if the new languages offer it.
    const known = codes.includes(setup.known) ? setup.known : codes[0];
    const learning = codes.find((c) => c !== known) ?? codes[0];
    const seed = group.choices.find((c) => c.isBase) ?? group.choices[0];
    commit({ known, learning, packIds: seed ? [seed.pack.id] : [BASE_ID] });
    setLangOpen(false);
  }

  return (
    <div className="cm-board">
      <h2>Languages</h2>
      <DirectionSwap
        leftRole="Speaks"
        rightRole="Learning"
        left={langOf(setup.known)}
        right={langOf(setup.learning)}
        onSwap={() => commit({ ...setup, known: setup.learning, learning: setup.known })}
      />

      {groups.size > 1 && (
        <>
          <button
            type="button"
            className="btn cs-accordion cm-langtoggle"
            aria-expanded={langOpen}
            onClick={() => setLangOpen((o) => !o)}
          >
            <span className="cs-accordion-caret" aria-hidden>
              {langOpen ? "▾" : "▸"}
            </span>
            Teach a different language on this board
          </button>
          {langOpen && (
            <>
              <div className="lang-choice-grid" role="radiogroup" aria-label="Languages">
                {[...groups].map(([sig, g]) => (
                  <button
                    key={sig}
                    type="button"
                    role="radio"
                    aria-checked={sig === signature}
                    className={"lang-choice" + (sig === signature ? " active" : "")}
                    onClick={() => switchLanguages(sig)}
                  >
                    <span className="lang-choice-flags" aria-hidden>
                      {g.languages.map((l) => l.flag).join(" ")}
                    </span>
                    <span className="lang-choice-name">
                      {g.languages.map((l) => l.name).join(" & ")}
                    </span>
                    <span className="lang-choice-meta">
                      {g.choices.length === 1 ? "1 pack" : `${g.choices.length} packs`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="hint">
                Activities already on the board keep the languages they were made
                with — this sets what new ones use.
              </p>
            </>
          )}
        </>
      )}

      <h2>Content packs</h2>
      <p className="hint">
        Everything ticked teaches on this board. Tick several to combine them —
        <b>Load content…</b> above adds a new pack straight to this board.
      </p>

      <ul className="pack-list">
        {here.map(({ pack, isBase, fromBoard }) => {
          const checked = chosen.has(pack.id);
          const onlyPick = checked && chosen.size === 1;
          return (
            <li key={pack.id} className={checked ? undefined : "pack-off"}>
              <label className="pack-name">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={onlyPick}
                  title={onlyPick ? "A board needs at least one pack" : undefined}
                  onChange={() => togglePack(pack.id)}
                />
                <span className="pack-name-main">
                  <span>
                    {pack.name}
                    {isBase && <span className="pack-badge">built-in</span>}
                    {fromBoard && <span className="pack-badge">from this board</span>}
                  </span>
                  <span className="pack-counts">{packSummary(pack)}</span>
                </span>
              </label>
              <button className="btn small" onClick={() => onReview(pack)}>
                View
              </button>
            </li>
          );
        })}
      </ul>

      {missingIds.length > 0 && (
        <p className="cm-missing">
          This board also asks for content this device doesn&rsquo;t have:{" "}
          <strong>{missingIds.join(", ")}</strong>. Load it to teach from it
          again — everything else on the board still works.
        </p>
      )}
    </div>
  );
}
