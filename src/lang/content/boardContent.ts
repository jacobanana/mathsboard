// WHAT A BOARD TEACHES — reading, writing and applying a board's content choice.
//
// A language board declares its own content (BoardDocument.contentSetup): the
// direction it teaches and the ids of the packs it teaches from. This module is
// the pure logic around that field — no React, no store — so the same rules
// serve the boards list, the new-board flow, the content manager and the
// document wiring in board/store.ts:
//
//   • READ    — setupOf() gets a board's choice, falling back for documents
//               saved before the field existed (their widgets and embedded
//               packs still say what they taught).
//   • RESOLVE — resolveSetup() turns pack ids into the real packs, and names
//               the ones this device simply doesn't have.
//   • APPLY   — applySetup() switches the registry's active packs and the
//               language pair to match, so opening a board teaches what it
//               taught when it was saved.
//   • EMBED   — packsToEmbed() picks the packs a board must CARRY so its
//               content survives a trip to another device or a collaborator.
//
// The invariant everywhere: the built-in pack is the id "base", and packs only
// combine when they cover the same languages (see packDirectory.ts).

import { isContentSetup, type BoardContentSetup, type BoardDocument } from "@/board/types";
import {
  BASE_PACK,
  boardPacksNow,
  currentContent,
  importedPacks,
  isBaseActive,
  isPackActive,
  setBaseActive,
  setPackActive,
} from "@/lang/content/registry";
import { dedupePacks, packsUsedBy } from "@/lang/content/embed";
import type { ContentPack } from "@/lang/content/schema";
import { useLangStore } from "@/lang/store";
import { isValidPair } from "@/lang/pairs";

/** The built-in pack's id — the one pack that is always available. */
export const BASE_ID = "base";

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

// isContentSetup — the "is this a usable setup" gate — lives in board/types.ts
// beside the type itself, so the document layer can use it without importing
// any language code. Re-exported here so callers have one content-side import.
export { isContentSetup };

/** Two setups mean the same thing (order of pack ids is not meaningful). */
export function sameSetup(
  a: BoardContentSetup | undefined,
  b: BoardContentSetup | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (a.known !== b.known || a.learning !== b.learning) return false;
  if (a.packIds.length !== b.packIds.length) return false;
  const ids = new Set(a.packIds);
  return b.packIds.every((id) => ids.has(id));
}

/** A stable string for a setup, for cheap change detection. */
export function setupSignature(setup: BoardContentSetup | undefined): string {
  if (!setup) return "";
  return `${setup.known}>${setup.learning}|${[...setup.packIds].sort().join(",")}`;
}

/**
 * A board's content choice, INFERRED from a document that predates the field
 * (or from a board built before it was ever asked): the direction comes from
 * the first language widget on it, and the packs from whatever it carries —
 * plus the built-in pack, which every board could always draw on.
 *
 * Returns undefined when there is nothing to infer (a blank board, a board of
 * plain drawings): saying nothing is better than inventing a choice the user
 * never made.
 */
export function inferSetup(board: BoardDocument): BoardContentSetup | undefined {
  const carried = Array.isArray(board.contentPacks) ? board.contentPacks : [];
  let pair: { known: string; learning: string } | null = null;
  for (const o of board.objects as readonly Record<string, unknown>[]) {
    if (typeof o.type !== "string" || !o.type.startsWith("lang")) continue;
    if (isStr(o.known) && isStr(o.learning) && o.known !== o.learning) {
      pair = { known: o.known, learning: o.learning };
      break;
    }
  }
  // No widget to read the direction off: a carried pack still names the
  // languages, in its own declared order (which reads naturally, e.g. en→fr).
  if (!pair) {
    const codes = carried[0]?.languages?.map((l) => l.code) ?? [];
    if (codes.length >= 2) pair = { known: codes[0], learning: codes[1] };
  }
  if (!pair) return undefined;
  const packIds = carried.map((p) => p.id);
  // A board carrying custom packs teaches from those; one carrying none can
  // only ever have been teaching from the built-in content.
  return { ...pair, packIds: packIds.length > 0 ? packIds : [BASE_ID] };
}

/** A board's content choice: what it declares, else what its contents imply. */
export function setupOf(board: BoardDocument): BoardContentSetup | undefined {
  if (isContentSetup(board.contentSetup)) return board.contentSetup;
  return inferSetup(board);
}

export interface ResolvedSetup {
  /** The packs the setup names that this device can actually teach from. */
  packs: ContentPack[];
  /** Ids the setup names that are neither in the library nor carried by the
   *  board — content this device doesn't have. */
  missingIds: string[];
  /** Whether the built-in pack is part of the choice. */
  base: boolean;
}

/**
 * Turn a setup's pack ids into real packs, looking in the device library first
 * and then in the packs the board itself carries (so a board shared by someone
 * else resolves even though nothing was ever imported here).
 */
export function resolveSetup(
  setup: BoardContentSetup | undefined,
  carried: ContentPack[] = boardPacksNow(),
): ResolvedSetup {
  if (!setup) return { packs: [], missingIds: [], base: true };
  const library = new Map(importedPacks().map((p) => [p.id, p]));
  const board = new Map(carried.map((p) => [p.id, p]));
  const packs: ContentPack[] = [];
  const missingIds: string[] = [];
  let base = false;
  for (const id of setup.packIds) {
    if (id === BASE_ID) {
      base = true;
      continue;
    }
    const pack = library.get(id) ?? board.get(id);
    if (pack) packs.push(pack);
    else missingIds.push(id);
  }
  return { packs, missingIds, base };
}

/**
 * Add freshly loaded packs to a board's choice — but only the ones that teach
 * the SAME languages, since only those can be combined (see packDirectory.ts).
 * Returns null when none of them apply, so the caller can leave the board alone
 * and say the content went to the library instead.
 */
export function withPacks(
  setup: BoardContentSetup,
  packs: ContentPack[],
): BoardContentSetup | null {
  const fits = (p: ContentPack): boolean => {
    const codes = new Set((p.languages ?? []).map((l) => l.code));
    return codes.has(setup.known) && codes.has(setup.learning);
  };
  const fresh = packs.filter((p) => fits(p) && !setup.packIds.includes(p.id));
  if (fresh.length === 0) return null;
  return { ...setup, packIds: [...setup.packIds, ...fresh.map((p) => p.id)] };
}

/** The setup the app is currently teaching from: the registry's active packs
 *  and the live language pair. This is what gets stamped onto a board. */
export function currentSetup(): BoardContentSetup {
  const { known, learning } = useLangStore.getState().pair;
  const packIds = [
    ...(isBaseActive() ? [BASE_ID] : []),
    ...importedPacks().filter((p) => isPackActive(p.id)).map((p) => p.id),
    // The open board's own packs always teach, so they are part of the choice
    // even when they were never imported into this device's library.
    ...boardPacksNow().map((p) => p.id),
  ];
  return { known, learning, packIds: packIds.length > 0 ? packIds : [BASE_ID] };
}

/**
 * Make the app teach what `setup` says: switch the registry's active packs to
 * exactly the ones it names (imports first, so base can be switched off without
 * tripping the "never leave the catalogue empty" guard) and point the language
 * pair at its direction.
 *
 * Idempotent — re-applying the setup the app is already on changes nothing, so
 * it is safe to run on every board change.
 */
export function applySetup(setup: BoardContentSetup): void {
  const wanted = new Set(setup.packIds);
  for (const p of importedPacks()) setPackActive(p.id, wanted.has(p.id));
  // Base stays on when the setup names it — and also when nothing else it names
  // is available here, so a board whose packs are missing still teaches
  // something rather than falling back to a leftover foreign catalogue.
  const { packs, base } = resolveSetup(setup);
  setBaseActive(base || packs.length === 0);
  const pair = { known: setup.known, learning: setup.learning };
  if (isValidPair(pair)) useLangStore.getState().setPair(pair);
}

/**
 * The packs a board must CARRY so its content travels: the ones its widgets
 * reference (the minimum a collaborator needs to see the same words) plus the
 * non-built-in packs its setup names — a board that says it teaches from
 * "Kitchen" should still teach from it after being shared, before a single
 * widget referencing it has been placed.
 *
 * `available` is everywhere a pack can be found: the device library and
 * whatever the board already carries.
 */
export function packsToEmbed(
  board: BoardDocument,
  setup: BoardContentSetup | undefined,
  available: ContentPack[],
): ContentPack[] {
  const chosen = new Set(setup?.packIds ?? []);
  const selected = available.filter((p) => p.id !== BASE_ID && chosen.has(p.id));
  return dedupePacks([...selected, ...packsUsedBy(board.objects, available)]);
}

/** Everywhere a pack can be found right now: the library plus a board's own. */
export function availablePacks(board?: BoardDocument): ContentPack[] {
  return dedupePacks([
    ...importedPacks(),
    ...(board?.contentPacks ?? []),
    ...boardPacksNow(),
  ]);
}

/** What a pack holds, in words a teacher scans: "240 words · 60 sentences ·
 *  18 verbs". One wording, used by every list that shows a pack. */
export function packSummary(pack: ContentPack): string {
  const n = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  return [
    n(pack.vocab?.length ?? 0, "word"),
    n(pack.sentences?.length ?? 0, "sentence"),
    n(pack.verbs?.length ?? 0, "verb"),
  ].join(" · ");
}

/** A pack's display name, from wherever it can be found, else the raw id (an
 *  id is at least honest about which content is missing). */
export function packNameFor(id: string, carried: ContentPack[] = boardPacksNow()): string {
  if (id === BASE_ID) return BASE_PACK.name;
  const found =
    importedPacks().find((p) => p.id === id) ?? carried.find((p) => p.id === id);
  return found?.name ?? id;
}

/**
 * A language's flag + name for a board that is NOT open. The live catalogue only
 * holds the languages currently teaching, so a Spanish board listed while the
 * app is on French would read as a bare "es" — resolve through the setup's own
 * packs first, and only then fall back to the catalogue and the raw code.
 */
function languageLabel(code: string, setup: BoardContentSetup): string {
  const { packs, base } = resolveSetup(setup);
  for (const pack of [...packs, ...(base ? [BASE_PACK] : []), BASE_PACK]) {
    const l = pack.languages?.find((x) => x.code === code);
    if (l) return `${l.flag} ${l.name}`.trim();
  }
  const live = currentContent().languages.find((l) => l.code === code);
  return live ? `${live.flag} ${live.name}`.trim() : code;
}

/**
 * One line describing what a board teaches — "🇬🇧 English → 🇪🇸 Spanish · Spanish
 * starter" — for the boards list, so choosing a saved board doesn't mean opening
 * it to find out which language and content it is.
 */
export function describeSetup(setup: BoardContentSetup | undefined): string {
  if (!setup) return "";
  const direction = `${languageLabel(setup.known, setup)} → ${languageLabel(setup.learning, setup)}`;
  const packs = setup.packIds.map((id) => packNameFor(id)).join(" + ");
  return packs ? `${direction} · ${packs}` : direction;
}
