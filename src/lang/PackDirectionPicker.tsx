// PICK LANGUAGES, THEN CONTENT, when starting a language board.
//
// The new-board flow always asks the LANGUAGE first (which languages, which
// direction), then offers the CONTENT that teaches those languages — so the
// wizard is two views over one pick-state: PackLanguageStep (language cards +
// direction) and PackContentStep (the packs covering the chosen languages).
// All the grouping / defaulting / apply logic lives in packDirectory.ts; this
// file is the views plus the small amount of pick-state they drive. Nothing is
// committed until apply() runs (on the modal's Start), so cancelling leaves the
// learner's current packs and pair untouched.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  directionFor,
  initialChoice,
  packGroups,
  setupFrom,
  type PackGroup,
} from "@/lang/packDirectory";
import {
  BASE_PACK,
  contentVersion,
  importedPacks,
  subscribeContent,
} from "@/lang/content/registry";
import { DirectionSwap } from "@/lang/DirectionSwap";
import { packSummary } from "@/lang/content/boardContent";
import { importPackFiles } from "@/lang/content/files";
import type { LangPair } from "@/lang/pairs";
import type { BoardContentSetup } from "@/board/types";
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
  /** The choice, as the content setup a new board is stamped with. */
  setup(): BoardContentSetup;
}

export function usePackDirection(): PackDirection {
  // Content can be LOADED from inside this flow ("Load content…" on the content
  // step), so the groups are read fresh on every catalogue change rather than
  // memoised once at mount — otherwise the pack you just loaded wouldn't appear.
  const version = useSyncExternalStore(subscribeContent, contentVersion);
  const groups = useMemo(() => packGroups(), [version]);
  const init = useMemo(() => initialChoice(packGroups()), []);
  // The learner's current pair seeds the direction, kept where the group allows.
  const startPair = useMemo(() => useLangStore.getState().pair, []);

  // The chosen group is held by SIGNATURE, not by object: `groups` is rebuilt
  // whenever content changes, so a stored object would go stale.
  const [signature, setSignature] = useState<string | null>(init.group?.signature ?? null);
  const [selected, setSelected] = useState<Set<string>>(init.selected);
  const [pair, setPair] = useState<LangPair>(() =>
    init.group ? directionFor(init.group, startPair) : startPair,
  );

  const group = groups.find((g) => g.signature === signature) ?? groups[0] ?? null;

  // A pack loaded from inside the flow is what the learner just asked for, so
  // tick it: same languages as the group they're on → add it to the selection;
  // different languages → move to its group with just it ticked.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(groups.flatMap((g) => g.packs.map((p) => p.id)));
    const before = known.current;
    known.current = ids;
    if (!before) return; // first run — nothing was "just loaded"
    const fresh = [...ids].filter((id) => !before.has(id));
    if (fresh.length === 0) return;
    const landed = groups.find((g) => g.packs.some((p) => p.id === fresh[0]));
    if (!landed) return;
    if (landed.signature === signature) {
      setSelected((prev) => new Set([...prev, ...fresh]));
    } else {
      setSignature(landed.signature);
      setSelected(new Set(fresh));
      setPair((p) => directionFor(landed, p));
    }
  }, [groups, signature]);

  function chooseGroup(next: PackGroup): void {
    if (next.signature === signature) return;
    setSignature(next.signature);
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

  // Only packs the CHOSEN group offers can be part of the choice — a stale tick
  // from a group we've moved on from must never reach the board.
  const inGroup = new Set(group?.packs.map((p) => p.id) ?? []);
  const picked = new Set([...selected].filter((id) => inGroup.has(id)));

  // Validate the direction against the CHOSEN group, not the live catalogue: the
  // selected pack may add a language that isn't active yet (it's only committed on
  // apply), so isValidPair() against the current catalogue would wrongly reject it.
  const codes = group?.languages.map((l) => l.code) ?? [];
  const pairFits =
    pair.known !== pair.learning && codes.includes(pair.known) && codes.includes(pair.learning);
  const canStart = group != null && picked.size > 0 && pairFits;

  return {
    groups,
    group,
    selected: picked,
    pair,
    chooseGroup,
    togglePack,
    setKnown,
    setLearning,
    swap,
    canStart,
    setup: () => setupFrom(picked, pair),
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

interface ContentStepProps extends Props {
  /** Open the full content manager (create your own, delete, download). */
  onManage?: () => void;
}

/** STEP 1 — the language: every language set content exists for, as pickable
 *  cards, plus the direction (which side you speak, which you're learning). */
export function PackLanguageStep({ dir }: Props): JSX.Element {
  const { groups, group, pair } = dir;

  if (!group) {
    return <p className="hint">No language content is available.</p>;
  }

  const twoWay = group.languages.length === 2;
  const known = langLabel(group, pair.known);
  const learning = langLabel(group, pair.learning);

  return (
    <div className="pack-picker">
      <div className="lang-choice-grid" role="radiogroup" aria-label="Languages">
        {groups.map((g) => {
          const active = g.signature === group.signature;
          const n = g.packs.length;
          return (
            <button
              key={g.signature}
              type="button"
              role="radio"
              aria-checked={active}
              className={"lang-choice" + (active ? " active" : "")}
              onClick={() => dir.chooseGroup(g)}
            >
              <span className="lang-choice-flags" aria-hidden>
                {g.languages.map((l) => l.flag).join(" ")}
              </span>
              <span className="lang-choice-name">
                {g.languages.map((l) => l.name).join(" & ")}
              </span>
              <span className="lang-choice-meta">
                {n === 1 ? "1 content pack" : `${n} content packs`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Direction: which side you speak, which you're learning. One click swaps.
          Two languages (the common case) use the shared swap control; a group
          with more than two falls back to selects so any pairing is reachable. */}
      {twoWay ? (
        <DirectionSwap
          leftRole="I speak"
          rightRole="Learning"
          left={known}
          right={learning}
          onSwap={dir.swap}
        />
      ) : (
        <div className="lang-dir">
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
            <select value={pair.learning} onChange={(e) => dir.setLearning(e.target.value)}>
              {group.languages.map((l) => (
                <option key={l.code} value={l.code} disabled={l.code === pair.known}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

/** What a pack holds, for the content step's row. Resolved from the registry
 *  (base or the imported library) through the one shared wording. */
function summaryOf(id: string, isBase: boolean): string {
  const p = isBase ? BASE_PACK : importedPacks().find((x) => x.id === id);
  return p ? packSummary(p) : "";
}

/** STEP 2 — the content: the packs covering the chosen languages, each showing
 *  what it holds. Several combine; at least one stays ticked. Content can be
 *  loaded right here, without leaving the flow — a newly loaded pack is ticked
 *  for you (see usePackDirection). */
export function PackContentStep({ dir, onManage }: ContentStepProps): JSX.Element {
  const { group, selected } = dir;
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setErrors((await importPackFiles(files)).errors);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (!group) {
    return <p className="hint">No language content is available.</p>;
  }

  return (
    <div className="pack-picker">
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
                <span className="pack-name-main">
                  <span>
                    {p.name}
                    {p.isBase && <span className="pack-badge">built-in</span>}
                  </span>
                  <span className="pack-counts">{summaryOf(p.id, p.isBase)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {group.packs.length > 1 && (
        <p className="hint pack-combine-hint">Tick several packs to combine them.</p>
      )}

      {errors.length > 0 && (
        <div className="cs-errors">
          <strong>Couldn&rsquo;t load:</strong>
          <ul>
            {errors.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="pack-load-row">
        <button className="btn small" onClick={() => fileRef.current?.click()}>
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
        {onManage && (
          <button className="btn small" onClick={onManage}>
            Manage content →
          </button>
        )}
      </div>
    </div>
  );
}
