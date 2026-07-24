// THE CONTENT REGISTRY — the one place that turns "the base pack + whatever the
// user imported" into the single flat catalogue every widget reads.
//
// The board's built-in content lives in base.json and is loaded here exactly
// like an imported pack, so there is no privileged "hardcoded" path. Imported
// packs are kept in localStorage (per-device, like the language-pair choice).
//
// Each imported pack can be switched ON or OFF: only the ACTIVE packs feed the
// catalogue, so a teacher can focus a lesson on a single pack or combine a few.
// The base pack is on by default and the open board's own packs are always
// active. Base can additionally be switched OFF to teach purely from imported /
// board packs — but only while some other pack is active, so the catalogue is
// never left empty. Loading a new pack selects just that one by default (see
// importPackJson). The active selection is persisted per-device alongside the
// packs themselves.
//
// data.ts and conjugation.ts don't hold arrays of their own any more — they
// register a consumer here and mirror the merged catalogue in place, so the
// existing `VOCAB` / `VERBS` / … exports keep working and update live when a
// pack is imported or removed.

import baseJson from "@/lang/content/base.json";
import {
  validatePack,
  type ContentPack,
  type MergedContent,
} from "@/lang/content/schema";
import { bumpGalleryVersion } from "@/tools/registry";

/** The built-in pack. Authored in the pack format and trusted (it is generated
 *  from the tested catalogue), so it is not re-validated at load. */
export const BASE_PACK = baseJson as unknown as ContentPack;

// A pack's LANGUAGE SIGNATURE: its language codes, sorted and joined. Two packs
// may only be combined (active together) when their signatures match — an
// English↔French pack is never mixed into an English↔Spanish board. This is the
// same rule the new-board picker groups by; enforcing it here makes it hold for
// every path (import, the content manager's checkboxes, programmatic toggles).
const sigOf = (p: { languages?: { code: string }[] }): string =>
  (p.languages ?? [])
    .map((l) => l.code)
    .slice()
    .sort()
    .join(",");
const BASE_SIG = sigOf(BASE_PACK);

const STORAGE_KEY = "langboard.content.v1";
// Which imported packs are currently ACTIVE — i.e. contribute to the merged
// catalogue widgets draw from. The open board's own packs are always active;
// the base pack and the user's imported library are selectable. Persisted
// per-device so the choice survives a reload.
const ACTIVE_KEY = "langboard.content.active.v1";
// Whether the built-in base pack contributes. On by default; can only be
// switched off while another pack is active (see setBaseActive). Persisted
// per-device alongside the imported selection.
const BASE_KEY = "langboard.content.base.v1";

// --- merge ------------------------------------------------------------------

function mergedFrom(packs: ContentPack[]): MergedContent {
  const languages: MergedContent["languages"] = [];
  const seenLang = new Set<string>();
  const categories: MergedContent["categories"] = [];
  const seenCat = new Set<string>();
  const pronouns: Record<string, string[]> = {};
  const vocab: MergedContent["vocab"] = [];
  const sentences: MergedContent["sentences"] = [];
  const verbs: MergedContent["verbs"] = [];
  const seenVerb = new Set<string>();
  const prepositions: MergedContent["prepositions"] = [];
  const seenPrep = new Set<string>();

  for (const pack of packs) {
    for (const l of pack.languages ?? []) {
      if (seenLang.has(l.code)) continue;
      seenLang.add(l.code);
      languages.push(l);
    }
    for (const c of pack.categories ?? []) {
      if (seenCat.has(c.id)) continue;
      seenCat.add(c.id);
      categories.push(c);
    }
    for (const [code, list] of Object.entries(pack.pronouns ?? {})) {
      // First pack to define a language's pronouns wins (base before imports).
      if (!pronouns[code]) pronouns[code] = list;
    }
    for (const v of pack.vocab ?? []) vocab.push(v);
    for (const s of pack.sentences ?? []) sentences.push(s);
    for (const vb of pack.verbs ?? []) {
      if (seenVerb.has(vb.id)) continue; // ids must stay unique for the resolver
      seenVerb.add(vb.id);
      verbs.push(vb);
    }
    for (const pp of pack.prepositions ?? []) {
      // Dedupe on the whole meaning (position + every term) so two packs that
      // both teach "sur → on" don't double it, but "sur" and "sous" stay apart.
      const sig = pp.position + "|" + JSON.stringify(pp.terms ?? {});
      if (seenPrep.has(sig)) continue;
      seenPrep.add(sig);
      prepositions.push(pp);
    }
  }

  return { languages, categories, pronouns, vocab, sentences, verbs, prepositions };
}

// --- persistence ------------------------------------------------------------

function loadImported(): ContentPack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Re-validate on load so a hand-edited / stale entry can't crash the app.
    return parsed.filter((p): p is ContentPack => validatePack(p).ok);
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
  } catch {
    /* storage may be unavailable (private mode) — the import is still live */
  }
}

/** The set of active imported-pack ids. Absent key ⇒ first run since this
 *  feature shipped: keep the previous behaviour of every imported pack active. */
function loadActive(importedNow: ContentPack[]): Set<string> {
  const all = () => new Set(importedNow.map((p) => p.id));
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw === null) return all();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return all();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return all();
  }
}

function persistActive(): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify([...activeIds]));
  } catch {
    /* storage may be unavailable — the selection is still live for this session */
  }
}

/** Whether the base pack is switched on. Absent key ⇒ default on. */
function loadBaseEnabled(): boolean {
  try {
    return localStorage.getItem(BASE_KEY) !== "false";
  } catch {
    return true;
  }
}

function persistBase(): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(baseEnabled));
  } catch {
    /* storage may be unavailable — the choice is still live for this session */
  }
}

// --- state ------------------------------------------------------------------

let imported: ContentPack[] = loadImported();
// The subset of `imported` that is switched on. board packs are always on;
// this only gates the user's imported library.
let activeIds: Set<string> = loadActive(imported);
// Whether the built-in base pack contributes. Reconciled below so it can never
// be off while there is nothing else to teach from.
let baseEnabled: boolean = loadBaseEnabled();
// Packs embedded in the currently-open board (see BoardDocument.contentPacks).
// EPHEMERAL — never persisted to this device's library; they exist so a board
// built from custom content resolves for anyone who opens or joins it, even
// without that pack imported. Replaced whenever the open board changes.
let boardPacks: ContentPack[] = [];

/** The active non-base packs: every ACTIVE imported pack plus the open board's
 *  own packs (minus any already provided by an active import, so nothing is
 *  counted twice). An imported pack switched off still leaves the board's own
 *  copy in play, so a shared board keeps resolving. */
function otherActivePacks(): ContentPack[] {
  const activeImported = imported.filter((p) => activeIds.has(p.id));
  const have = new Set(activeImported.map((p) => p.id));
  const effectiveBoard = boardPacks.filter((p) => !have.has(p.id));
  return [...activeImported, ...effectiveBoard];
}

/** The packs that currently feed the catalogue: the built-in base (unless the
 *  user switched it off while other content is active) plus every active
 *  non-base pack. */
function computeMerged(): MergedContent {
  const others = otherActivePacks();
  // Base can only be dropped while something else is active — otherwise the
  // catalogue would be empty, so base always feeds when nothing else does.
  const includeBase = baseEnabled || others.length === 0;
  return mergedFrom(includeBase ? [BASE_PACK, ...others] : others);
}

// Reconcile the persisted choice at load: base can't stay off with no other
// active content, so restore it (and the stored flag) if that's the case.
if (!baseEnabled && otherActivePacks().length === 0) {
  baseEnabled = true;
  persistBase();
}

let merged: MergedContent = computeMerged();

type Consumer = (content: MergedContent) => void;
const consumers: Consumer[] = [];
const listeners = new Set<() => void>();

/** Register a mirror of the merged catalogue. Called immediately with the
 *  current content, then again after every import/removal — so data.ts and
 *  conjugation.ts stay in sync by splicing their arrays in place. */
export function registerContentConsumer(consume: Consumer): void {
  consumers.push(consume);
  consume(merged);
}

/** React can subscribe to content changes (the content manager re-renders its
 *  list of imported packs, pickers pick up new languages/themes). */
export function subscribeContent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function rebuild(): void {
  // Base can only stay OFF while another pack is active; if the last one goes
  // away, restore base so the catalogue is never empty (and the checkbox
  // reflects reality on the next render).
  if (!baseEnabled && otherActivePacks().length === 0) {
    baseEnabled = true;
    persistBase();
  }
  merged = computeMerged();
  for (const consume of consumers) consume(merged);
  for (const listener of listeners) listener();
  // Imported/removed content can add or drop gendered nouns / prepositions —
  // re-check the Insert gallery's content-gated tools.
  bumpGalleryVersion();
}

const idsSig = (packs: ContentPack[]): string => packs.map((p) => p.id).join(",");

// --- public API -------------------------------------------------------------

export function currentContent(): MergedContent {
  return merged;
}

/** The imported packs, in import order (base is not included). */
export function importedPacks(): ContentPack[] {
  return imported;
}

export type ImportResult =
  | { ok: true; pack: ContentPack; replaced: boolean }
  | { ok: false; errors: string[] };

/**
 * Validate and add a pack from raw JSON text. A pack with an existing id (other
 * than "base") replaces the earlier import; "base" is reserved for the built-in
 * content and cannot be overwritten.
 */
export function importPackJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`The file is not valid JSON: ${(e as Error).message}`] };
  }
  const result = validatePack(parsed);
  if (!result.ok) return result;
  const pack = result.pack;
  if (pack.id === "base")
    return { ok: false, errors: ['The id "base" is reserved for the built-in content — use another id.'] };

  const at = imported.findIndex((p) => p.id === pack.id);
  const replaced = at >= 0;
  if (replaced) imported[at] = pack;
  else imported.push(pack);
  // The library copy supersedes the open board's carried copy (same invariant
  // as setBoardPacks) — saving a board's pack also clears it from "in this
  // board but not in your library".
  boardPacks = boardPacks.filter((p) => p.id !== pack.id);
  // Loading a pack makes it the sole active one — a lesson usually wants a
  // single pack's content, not everything merged. The user can re-enable other
  // SAME-LANGUAGE packs with their checkboxes to combine several again.
  activeIds = new Set([pack.id]);
  // Only same-language packs combine: a pack teaching a different language set
  // than the built-in English↔French base switches base off so the two aren't
  // mixed (base stays on for a same-language import — they can be combined).
  if (sigOf(pack) !== BASE_SIG) baseEnabled = false;
  persist();
  persistActive();
  persistBase();
  rebuild();
  return { ok: true, pack, replaced };
}

/**
 * Set the packs embedded in the currently-open board. Called whenever the board
 * changes (load, join, remote sync). Invalid packs are skipped, and a pack the
 * user already imported is dropped here so its vocab isn't counted twice. A
 * no-op when the effective set is unchanged, so it is cheap to call on every
 * board update.
 */
export function setBoardPacks(packs: ContentPack[]): void {
  const have = new Set(imported.map((p) => p.id));
  const next = packs.filter((p) => p.id !== "base" && !have.has(p.id) && validatePack(p).ok);
  if (idsSig(next) === idsSig(boardPacks)) return; // unchanged — skip the rebuild
  boardPacks = next;
  rebuild();
}

/** The packs embedded in the currently-open board (for inspection / UI). */
export function boardPacksNow(): ContentPack[] {
  return boardPacks;
}

/**
 * Load the OPEN BOARD's embedded packs as the ACTIVE teaching content — the
 * "a board arrives with its content" path (open a saved board, join a shared
 * one, follow a share link). setBoardPacks only registers the packs into the
 * catalogue; this additionally activates them the way choosing them at board
 * creation would, so the board teaches from its own content with no trip to
 * the contents page:
 *   • the user's own imported copy of a board pack is switched ON (a pack you
 *     imported but left inactive must still teach when its board opens — the
 *     board's copy is dropped in favour of yours, exactly like setBoardPacks);
 *   • base and any import of a DIFFERENT language set are switched off, so the
 *     board's languages are never silently mixed with unrelated content;
 *   • with no embedded packs and `restoreBase`, base comes back on and foreign
 *     imports are switched off — a board built purely on built-in content must
 *     not open against a leftover foreign catalogue.
 */
export function adoptBoardContent(packs: ContentPack[], restoreBase = false): void {
  const valid = packs.filter((p) => p.id !== "base" && validatePack(p).ok);
  const have = new Set(imported.map((p) => p.id));
  boardPacks = valid.filter((p) => !have.has(p.id));
  if (valid.length > 0) {
    const sig = sigOf(valid[0]);
    for (const p of imported) {
      if (valid.some((v) => v.id === p.id)) activeIds.add(p.id);
      else if (activeIds.has(p.id) && sigOf(p) !== sig) activeIds.delete(p.id);
    }
    if (sig !== BASE_SIG) baseEnabled = false;
  } else if (restoreBase) {
    baseEnabled = true;
    for (const p of imported) {
      if (activeIds.has(p.id) && sigOf(p) !== BASE_SIG) activeIds.delete(p.id);
    }
  }
  persistActive();
  persistBase();
  rebuild();
}

/** Remove an imported pack by id. Returns true if one was removed. */
export function removeImportedPack(id: string): boolean {
  const at = imported.findIndex((p) => p.id === id);
  if (at < 0) return false;
  imported.splice(at, 1);
  activeIds.delete(id);
  persist();
  persistActive();
  rebuild();
  return true;
}

// --- base-pack selection -----------------------------------------------------
// The base pack is on by default, but a teacher can switch it off to teach
// purely from their own imported / board content. Guard: it can only be off
// while another pack is active, so the catalogue is never emptied.

/** Whether the built-in base content currently feeds the catalogue. */
export function isBaseActive(): boolean {
  return baseEnabled;
}

/** Whether the base pack can be switched off right now — i.e. another pack is
 *  active to take over. When false the base checkbox stays forced on. */
export function canDisableBase(): boolean {
  return otherActivePacks().length > 0;
}

/** Turn the base pack on or off. Switching it off is ignored unless another
 *  pack is active (the catalogue must never be empty). A no-op when already in
 *  the requested state. */
export function setBaseActive(active: boolean): void {
  if (baseEnabled === active) return;
  if (!active && !canDisableBase()) return;
  if (active) {
    // Base is English↔French; switching it on drops any active import of a
    // different language set so only same-language packs stay combined.
    for (const p of imported) {
      if (activeIds.has(p.id) && sigOf(p) !== BASE_SIG) activeIds.delete(p.id);
    }
  }
  baseEnabled = active;
  persistBase();
  persistActive();
  rebuild();
}

// --- active-pack selection ---------------------------------------------------
// the open board's packs always contribute; the base pack and the imported
// library are switchable, so a teacher can focus a lesson on one pack (or
// combine a few).

/** The ids of the imported packs that are currently active. */
export function activePackIds(): string[] {
  return imported.filter((p) => activeIds.has(p.id)).map((p) => p.id);
}

/** Whether an imported pack contributes to the catalogue right now. Board packs
 *  are always active and the base pack has its own toggle (isBaseActive); neither
 *  is tracked here. */
export function isPackActive(id: string): boolean {
  return activeIds.has(id);
}

/** Turn an imported pack on or off. Unknown ids are ignored. A no-op (the pack
 *  is already in the requested state) skips the rebuild. Switching a pack ON
 *  drops every active pack (base or import) of a different language set, so only
 *  same-language packs are ever combined. */
export function setPackActive(id: string, active: boolean): void {
  const pack = imported.find((p) => p.id === id);
  if (!pack) return;
  if (activeIds.has(id) === active) return;
  if (active) {
    const sig = sigOf(pack);
    // A different-language pack can't share the catalogue with the base pack…
    if (sig !== BASE_SIG) baseEnabled = false;
    // …nor with imports of another language set.
    for (const p of imported) {
      if (p.id !== id && activeIds.has(p.id) && sigOf(p) !== sig) activeIds.delete(p.id);
    }
    activeIds.add(id);
  } else {
    activeIds.delete(id);
  }
  persistActive();
  persistBase();
  rebuild();
}
