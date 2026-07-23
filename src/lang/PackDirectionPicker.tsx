// PICK A LANGUAGE PACK + DIRECTION when starting a language board.
//
// Replaces the old two-dropdown "I speak / I want to learn" picker. The learner
// chooses a pack (or several that cover the SAME languages) and flips the
// direction with one click. All the grouping / defaulting / apply logic lives in
// packDirectory.ts; this file is the view plus the small amount of pick-state it
// drives. Nothing is committed until apply() runs (on the modal's Start), so
// cancelling leaves the learner's current packs and pair untouched.

import { useMemo, useState } from "react";
import {
  applyChoice,
  directionFor,
  initialChoice,
  packGroups,
  type PackGroup,
} from "@/lang/packDirectory";
import type { LangPair } from "@/lang/pairs";
import { useLangStore } from "@/lang/store";

/** The pick-state + handlers, owned by the host modal so its Start button can
 *  commit (apply) and gate on (canStart) the same state the picker shows. */
export interface PackDirection {
  groups: PackGroup[];
  group: PackGroup | null;
  selected: Set<string>;
  pair: LangPair;
  chooseGroup(group: PackGroup): void;
  togglePack(id: string): void;
  setKnown(code: string): void;
  setLearning(code: string): void;
  swap(): void;
  canStart: boolean;
  apply(): void;
}

export function usePackDirection(): PackDirection {
  const groups = useMemo(() => packGroups(), []);
  const init = useMemo(() => initialChoice(groups), [groups]);
  // The learner's current pair seeds the direction, kept where the group allows.
  const startPair = useMemo(() => useLangStore.getState().pair, []);

  const [group, setGroup] = useState<PackGroup | null>(init.group);
  const [selected, setSelected] = useState<Set<string>>(init.selected);
  const [pair, setPair] = useState<LangPair>(() =>
    init.group ? directionFor(init.group, startPair) : startPair,
  );

  function chooseGroup(next: PackGroup): void {
    if (next.signature === group?.signature) return;
    setGroup(next);
    // Switching languages can't keep the old selection (different signature):
    // start the new group from its built-in / first pack.
    const seed = next.packs.find((p) => p.isBase) ?? next.packs[0];
    setSelected(new Set(seed ? [seed.id] : []));
    setPair(directionFor(next, pair));
  }

  function togglePack(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Keep at least one pack ticked — a board must teach from something.
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function setKnown(code: string): void {
    setPair((p) =>
      // Choosing the learning side as "known" swaps rather than colliding.
      code === p.learning ? { known: code, learning: p.known } : { ...p, known: code },
    );
  }

  function setLearning(code: string): void {
    setPair((p) =>
      code === p.known ? { known: p.learning, learning: code } : { ...p, learning: code },
    );
  }

  function swap(): void {
    setPair((p) => ({ known: p.learning, learning: p.known }));
  }

  // Validate the direction against the CHOSEN group, not the live catalogue: the
  // selected pack may add a language that isn't active yet (it's only committed on
  // apply), so isValidPair() against the current catalogue would wrongly reject it.
  const codes = group?.languages.map((l) => l.code) ?? [];
  const pairFits =
    pair.known !== pair.learning && codes.includes(pair.known) && codes.includes(pair.learning);
  const canStart = group != null && selected.size > 0 && pairFits;

  return {
    groups,
    group,
    selected,
    pair,
    chooseGroup,
    togglePack,
    setKnown,
    setLearning,
    swap,
    canStart,
    apply: () => applyChoice(selected, pair),
  };
}

/** A language's flag + English name, from the group's own declaration. */
function langLabel(group: PackGroup, code: string): { flag: string; name: string } {
  const l = group.languages.find((x) => x.code === code);
  return { flag: l?.flag ?? "", name: l?.name ?? code };
}

interface Props {
  dir: PackDirection;
}

export function PackDirectionPicker({ dir }: Props): JSX.Element {
  const { groups, group, selected, pair } = dir;

  if (!group) {
    return <p className="hint">No language packs are available.</p>;
  }

  const twoWay = group.languages.length === 2;
  const known = langLabel(group, pair.known);
  const learning = langLabel(group, pair.learning);

  return (
    <div className="pack-picker">
      {/* When several language sets exist, choose which one first. A single set
          (the common case) needs no chooser — the packs are shown straight away. */}
      {groups.length > 1 && (
        <div className="pack-group-tabs" role="tablist" aria-label="Languages">
          {groups.map((g) => (
            <button
              key={g.signature}
              type="button"
              role="tab"
              aria-selected={g.signature === group.signature}
              className={
                "pack-group-tab" + (g.signature === group.signature ? " active" : "")
              }
              onClick={() => dir.chooseGroup(g)}
            >
              <span className="pack-group-flags" aria-hidden>
                {g.languages.map((l) => l.flag).join(" ")}
              </span>
              {g.languages.map((l) => l.name).join(" & ")}
            </button>
          ))}
        </div>
      )}

      {/* Direction: which side you speak, which you're learning. One click swaps. */}
      <div className="lang-dir">
        {twoWay ? (
          <>
            <div className="lang-dir-side">
              <span className="lang-dir-role">I speak</span>
              <span className="lang-dir-lang">
                <span className="lang-dir-flag" aria-hidden>
                  {known.flag}
                </span>
                {known.name}
              </span>
            </div>
            <button
              type="button"
              className="lang-dir-swap"
              onClick={dir.swap}
              title="Swap direction"
              aria-label="Swap direction"
            >
              ⇄
            </button>
            <div className="lang-dir-side">
              <span className="lang-dir-role">Learning</span>
              <span className="lang-dir-lang">
                <span className="lang-dir-flag" aria-hidden>
                  {learning.flag}
                </span>
                {learning.name}
              </span>
            </div>
          </>
        ) : (
          <>
            <label className="lang-dir-side">
              <span className="lang-dir-role">I speak</span>
              <select value={pair.known} onChange={(e) => dir.setKnown(e.target.value)}>
                {group.languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="lang-dir-swap"
              onClick={dir.swap}
              title="Swap direction"
              aria-label="Swap direction"
            >
              ⇄
            </button>
            <label className="lang-dir-side">
              <span className="lang-dir-role">Learning</span>
              <select
                value={pair.learning}
                onChange={(e) => dir.setLearning(e.target.value)}
              >
                {group.languages.map((l) => (
                  <option key={l.code} value={l.code} disabled={l.code === pair.known}>
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* The packs feeding this board. Several can be combined when they share the
          same languages; at least one stays ticked. */}
      <ul className="pack-list">
        {group.packs.map((p) => {
          const checked = selected.has(p.id);
          const onlyPick = checked && selected.size === 1;
          return (
            <li key={p.id} className={checked ? undefined : "pack-off"}>
              <label className="pack-name">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={onlyPick}
                  title={onlyPick ? "A board needs at least one pack" : undefined}
                  onChange={() => dir.togglePack(p.id)}
                />
                {p.name}
                {p.isBase && <span className="pack-badge">built-in</span>}
              </label>
            </li>
          );
        })}
      </ul>

      {group.packs.length > 1 && (
        <p className="hint pack-combine-hint">Tick several packs to combine them.</p>
      )}
    </div>
  );
}
