// THE CONTENT REGISTRY — the one place that turns "the base pack + whatever the
// user imported" into the single flat catalogue every widget reads.
//
// The board's built-in content lives in base.json and is loaded here exactly
// like an imported pack, so there is no privileged "hardcoded" path. Imported
// packs are kept in localStorage (per-device, like the language-pair choice).
//
// Each imported pack can be switched ON or OFF: only the ACTIVE packs feed the
// catalogue, so a teacher can focus a lesson on a single pack or combine a few.
// The built-in base and the open board's own packs are always active. Loading a
// new pack selects just that one by default (see importPackJson). The active
// selection is persisted per-device alongside the packs themselves.
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

/** The built-in pack. Authored in the pack format and trusted (it is generated
 *  from the tested catalogue), so it is not re-validated at load. */
export const BASE_PACK = baseJson as unknown as ContentPack;

const STORAGE_KEY = "langboard.content.v1";
// Which imported packs are currently ACTIVE — i.e. contribute to the merged
// catalogue widgets draw from. The base pack and the open board's own packs are
// always active; only the user's imported library is selectable. Persisted
// per-device so the choice survives a reload.
const ACTIVE_KEY = "langboard.content.active.v1";

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
  }

  return { languages, categories, pronouns, vocab, sentences, verbs };
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

// --- state ------------------------------------------------------------------

let imported: ContentPack[] = loadImported();
// The subset of `imported` that is switched on. base + board packs are always
// on; this only gates the user's imported library.
let activeIds: Set<string> = loadActive(imported);
// Packs embedded in the currently-open board (see BoardDocument.contentPacks).
// EPHEMERAL — never persisted to this device's library; they exist so a board
// built from custom content resolves for anyone who opens or joins it, even
// without that pack imported. Replaced whenever the open board changes.
let boardPacks: ContentPack[] = [];

/** The packs that currently feed the catalogue: the built-in base, every ACTIVE
 *  imported pack, and the open board's own packs (minus any the user already
 *  imported, so nothing is counted twice). */
function computeMerged(): MergedContent {
  const activeImported = imported.filter((p) => activeIds.has(p.id));
  // Only an ACTIVE import supersedes the board's own copy of a pack; if the user
  // imported that pack but switched it off, the board still needs its own copy
  // to resolve, so don't drop it here.
  const have = new Set(activeImported.map((p) => p.id));
  const effectiveBoard = boardPacks.filter((p) => !have.has(p.id));
  return mergedFrom([BASE_PACK, ...activeImported, ...effectiveBoard]);
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
  merged = computeMerged();
  for (const consume of consumers) consume(merged);
  for (const listener of listeners) listener();
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
  // Loading a pack makes it the sole active one — a lesson usually wants a
  // single pack's content, not everything merged. The user can re-enable other
  // packs with their checkboxes to combine several again.
  activeIds = new Set([pack.id]);
  persist();
  persistActive();
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

// --- active-pack selection ---------------------------------------------------
// base and the open board's packs always contribute; only the imported library
// is switchable, so a teacher can focus a lesson on one pack (or combine a few).

/** The ids of the imported packs that are currently active. */
export function activePackIds(): string[] {
  return imported.filter((p) => activeIds.has(p.id)).map((p) => p.id);
}

/** Whether an imported pack contributes to the catalogue right now. base packs
 *  and board packs are always active and are not tracked here. */
export function isPackActive(id: string): boolean {
  return activeIds.has(id);
}

/** Turn an imported pack on or off. Unknown ids are ignored. A no-op (the pack
 *  is already in the requested state) skips the rebuild. */
export function setPackActive(id: string, active: boolean): void {
  if (!imported.some((p) => p.id === id)) return;
  if (activeIds.has(id) === active) return;
  if (active) activeIds.add(id);
  else activeIds.delete(id);
  persistActive();
  rebuild();
}
