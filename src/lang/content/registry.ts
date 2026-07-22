// THE CONTENT REGISTRY — the one place that turns "the base pack + whatever the
// user imported" into the single flat catalogue every widget reads.
//
// The board's built-in content lives in base.json and is loaded here exactly
// like an imported pack, so there is no privileged "hardcoded" path. Imported
// packs are kept in localStorage (per-device, like the language-pair choice):
// they only ever ADD to what the app can teach, and because widgets bake their
// content into their own params at creation time, importing new content changes
// what NEW activities can draw from without ever disturbing a placed board or a
// collaborator.
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

// --- state ------------------------------------------------------------------

let imported: ContentPack[] = loadImported();
let merged: MergedContent = mergedFrom([BASE_PACK, ...imported]);

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
  merged = mergedFrom([BASE_PACK, ...imported]);
  for (const consume of consumers) consume(merged);
  for (const listener of listeners) listener();
}

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
  persist();
  rebuild();
  return { ok: true, pack, replaced };
}

/** Remove an imported pack by id. Returns true if one was removed. */
export function removeImportedPack(id: string): boolean {
  const at = imported.findIndex((p) => p.id === id);
  if (at < 0) return false;
  imported.splice(at, 1);
  persist();
  rebuild();
  return true;
}
