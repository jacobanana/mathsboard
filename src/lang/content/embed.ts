// Which content packs does a board actually depend on?
//
// Language widgets store only references — theme ids, a level, and the { known,
// learning } language codes (and, for conjugation, a verb id). They resolve the
// real words live from whatever content catalogue the device has. The built-in
// content is everywhere, so a board only needs to CARRY a pack when a widget
// leans on content that isn't built in: a non-built-in language, theme, or verb.
//
// packsUsedBy() finds exactly those packs, so the board embeds the minimum
// needed for a collaborator (or another device) to see the same content — not
// every pack the author happens to have imported.

import { BASE_PACK } from "@/lang/content/registry";
import type { ContentPack } from "@/lang/content/schema";
import { categoriesFromObj } from "@/lang/pairs";

// What the built-in content already provides — referencing any of these needs
// no pack, so they never trigger an embed (crucially, every pack lists English,
// so matching on languages without this exclusion would embed everything).
const BASE_LANGS = new Set(BASE_PACK.languages.map((l) => l.code));
const BASE_CATS = new Set(BASE_PACK.categories.map((c) => c.id));
const BASE_VERBS = new Set(BASE_PACK.verbs.map((v) => v.id));

/**
 * The subset of `packs` a board's objects depend on: those providing a
 * language, theme or verb that a language widget uses and that the built-in
 * content does not already cover.
 */
export function packsUsedBy(
  objects: readonly Record<string, unknown>[],
  packs: ContentPack[],
): ContentPack[] {
  const langs = new Set<string>();
  const cats = new Set<string>();
  const verbs = new Set<string>();

  for (const o of objects) {
    if (typeof o.type !== "string" || !o.type.startsWith("lang")) continue;
    for (const c of categoriesFromObj(o as Parameters<typeof categoriesFromObj>[0]))
      if (!BASE_CATS.has(c)) cats.add(c);
    if (typeof o.known === "string" && !BASE_LANGS.has(o.known)) langs.add(o.known);
    if (typeof o.learning === "string" && !BASE_LANGS.has(o.learning)) langs.add(o.learning);
    if (typeof o.verb === "string" && !BASE_VERBS.has(o.verb)) verbs.add(o.verb);
  }

  if (langs.size === 0 && cats.size === 0 && verbs.size === 0) return [];

  return packs.filter(
    (p) =>
      p.languages.some((l) => langs.has(l.code)) ||
      p.categories.some((c) => cats.has(c.id)) ||
      p.verbs.some((v) => verbs.has(v.id)),
  );
}

/** Dedupe packs by id, keeping the first occurrence. */
export function dedupePacks(packs: ContentPack[]): ContentPack[] {
  const seen = new Set<string>();
  const out: ContentPack[] = [];
  for (const p of packs) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}
