// CHOOSING WHAT A NEW LANGUAGE BOARD TEACHES — packs + direction.
//
// A content pack declares the languages it covers (base = English & French).
// The learner doesn't pick raw languages from a flat list any more: they pick a
// PACK (or several packs that cover the SAME languages) and a DIRECTION — which
// side they speak and which they're learning, swappable in one click.
//
// "Same languages on both sides" is the rule for combining: two packs may be
// used together only when their language sets match (their SIGNATURE — the
// sorted language codes — is identical). That keeps the merged catalogue
// coherent (every combined pack can pair the same two languages) instead of
// silently mixing, say, an English↔French pack with an English↔Spanish one.
//
// This module is the pure logic (grouping, defaults, apply); PackDirectionPicker
// is the view. Applying a choice writes through the SAME levers the rest of the
// app already uses — the content registry's active-pack flags and the language
// pair store — so nothing downstream needs to know packs are now the entry point.

import {
  importedPacks,
  isBaseActive,
  isPackActive,
  setBaseActive,
  setPackActive,
  BASE_PACK,
} from "@/lang/content/registry";
import type { PackLanguage } from "@/lang/content/schema";
import { useLangStore } from "@/lang/store";
import { defaultPair, isValidPair, type LangPair } from "@/lang/pairs";

/** A pack the learner can pick when starting a board — the built-in base pack
 *  and every pack imported into this device's library. */
export interface SelectablePack {
  id: string;
  name: string;
  /** The built-in content, which can't be removed (only switched off). */
  isBase: boolean;
  languages: PackLanguage[];
  /** Sorted, comma-joined language codes: packs combine iff signatures match. */
  signature: string;
}

/** All packs that cover the same set of languages — the unit the learner picks
 *  from. Only packs within one group can be combined. */
export interface PackGroup {
  signature: string;
  /** The group's languages, in the first pack's declared order (so the default
   *  direction reads naturally, e.g. English → French rather than French → …). */
  languages: PackLanguage[];
  packs: SelectablePack[];
}

/** The signature that decides combinability: the sorted language codes. */
export function signatureOf(languages: { code: string }[]): string {
  return languages
    .map((l) => l.code)
    .slice()
    .sort()
    .join(",");
}

/** Base + every imported pack, as pickable entries. */
export function selectablePacks(): SelectablePack[] {
  const toSel = (
    p: { id: string; name: string; languages: PackLanguage[] },
    isBase: boolean,
  ): SelectablePack => ({
    id: p.id,
    name: p.name,
    isBase,
    languages: p.languages,
    signature: signatureOf(p.languages),
  });
  return [toSel(BASE_PACK, true), ...importedPacks().map((p) => toSel(p, false))];
}

/** Group packs by language signature, preserving first-seen order. */
export function groupPacks(packs: SelectablePack[]): PackGroup[] {
  const groups: PackGroup[] = [];
  const bySig = new Map<string, PackGroup>();
  for (const p of packs) {
    let g = bySig.get(p.signature);
    if (!g) {
      g = { signature: p.signature, languages: p.languages, packs: [] };
      bySig.set(p.signature, g);
      groups.push(g);
    }
    g.packs.push(p);
  }
  return groups;
}

/** The groups available when starting a board, biggest (most packs) first so the
 *  richest option leads; base's group therefore leads on a fresh install. */
export function packGroups(): PackGroup[] {
  return groupPacks(selectablePacks());
}

/** A sensible { known, learning } for a group: keep the learner's current choice
 *  where the group offers it, otherwise fall back to the group's first two
 *  languages (or, failing that, the app default). */
export function directionFor(group: PackGroup, wanted: LangPair): LangPair {
  const codes = group.languages.map((l) => l.code);
  if (codes.length < 2) return defaultPair();
  const has = (c: string): boolean => codes.includes(c);
  const known = has(wanted.known) ? wanted.known : codes[0];
  const learning =
    has(wanted.learning) && wanted.learning !== known
      ? wanted.learning
      : codes.find((c) => c !== known) ?? codes[0];
  return { known, learning };
}

/** The ids of the packs currently feeding the catalogue (base + active imports).
 *  Used to pre-select the picker so it opens on what's already in play. */
export function activeSelection(): Set<string> {
  const ids = new Set<string>();
  if (isBaseActive()) ids.add("base");
  for (const p of importedPacks()) if (isPackActive(p.id)) ids.add(p.id);
  return ids;
}

/** Pick the group to open on, and which of its packs start ticked. Prefers the
 *  group holding the most currently-active packs (so the picker reflects reality)
 *  and falls back to the first group with its base/first pack ticked. */
export function initialChoice(groups: PackGroup[]): {
  group: PackGroup | null;
  selected: Set<string>;
} {
  if (groups.length === 0) return { group: null, selected: new Set() };
  const active = activeSelection();
  // Rank by how many of a group's packs are active, breaking ties toward a group
  // with an active IMPORTED pack: base is on almost always, so "I just imported a
  // Spanish pack" should open on Spanish, not the ever-present base group.
  const score = (g: PackGroup): [number, number] => {
    const hits = g.packs.filter((p) => active.has(p.id));
    return [hits.length, hits.some((p) => !p.isBase) ? 1 : 0];
  };
  let best = groups[0];
  let bestScore = score(best);
  for (const g of groups.slice(1)) {
    const s = score(g);
    if (s[0] > bestScore[0] || (s[0] === bestScore[0] && s[1] > bestScore[1])) {
      best = g;
      bestScore = s;
    }
  }
  const selected = new Set(best.packs.filter((p) => active.has(p.id)).map((p) => p.id));
  // Never open on an empty group — tick base if it's here, else the first pack.
  if (selected.size === 0) {
    const seed = best.packs.find((p) => p.isBase) ?? best.packs[0];
    if (seed) selected.add(seed.id);
  }
  return { group: best, selected };
}

/**
 * Commit a choice: switch the content registry's active packs to exactly the
 * selection, then set the language pair. Packs are toggled BEFORE the pair so
 * the chosen languages are in the merged catalogue when the pair is validated,
 * and imported packs are toggled before base so base can be switched off without
 * tripping the "never leave the catalogue empty" guard.
 */
export function applyChoice(selectedIds: Set<string>, pair: LangPair): void {
  for (const p of importedPacks()) setPackActive(p.id, selectedIds.has(p.id));
  setBaseActive(selectedIds.has("base"));
  if (isValidPair(pair)) useLangStore.getState().setPair(pair);
}
