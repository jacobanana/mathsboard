// THE LANGUAGE CONTENT — every word and sentence the widgets draw from, under
// ONE classification system shared by all content, plus the language catalogue.
//
// The content itself no longer lives here as source literals: it is authored in
// the portable content-pack format (content/schema.ts) and loaded through the
// content registry (content/registry.ts), which flattens the built-in
// base.json plus any packs the user imported into the arrays below. This module
// is now the app-facing VIEW of that catalogue — the same exported names
// (LANGUAGES, CATEGORIES, VOCAB, SENTENCES) every widget already imports — kept
// in sync in place so importing a pack updates them live.
//
// TWO AXES still classify every item — a word OR a sentence:
//   • category — the theme (Animals, Food, Feelings, …), from CATEGORIES.
//   • level    — how hard: "basic" → "medium" → "advanced".
// The dialogs let the learner pick a theme and a level; the resolver (pairs.ts)
// filters by both. The SAME { category, level } tags are on vocab and sentences,
// so the picker feels identical everywhere.
//
// SCALABILITY IS THE POINT. A word is not "the English word and the French
// word": it is a concept whose `terms` map holds ONE entry per language code.
// Adding a language is additive — import a pack that adds an entry to LANGUAGES
// and a key to each `terms` map — and every widget keeps working because they
// all resolve content through a chosen { known, learning } pair.

import { registerContentConsumer } from "@/lang/content/registry";
import {
  LEVELS as PACK_LEVELS,
  type Level,
  type PackCategory,
  type PackLanguage,
  type PackPreposition,
  type PackSentence,
  type PackVocab,
} from "@/lang/content/schema";

/** A supported language, identified by its ISO 639-1 code. */
export type LangCode = string;

export type Language = PackLanguage;

/** The languages the app currently knows about — the built-in pair plus any
 *  languages an imported pack added. Kept in sync in place by the registry. */
export const LANGUAGES: Language[] = [];

export const languageByCode = (code: LangCode): Language | undefined =>
  LANGUAGES.find((l) => l.code === code);

// --- the classification -----------------------------------------------------

/** Difficulty, low → high. */
export type { Level };
export const LEVELS: Level[] = [...PACK_LEVELS];
export const LEVEL_LABEL: Record<Level, string> = {
  basic: "Basic",
  medium: "Medium",
  advanced: "Advanced",
};

/** A theme both vocab and sentences can be tagged with. */
export type Category = PackCategory;

/** The themes, in the order the pickers show them. Populated from the loaded
 *  content packs. */
export const CATEGORIES: Category[] = [];

export const categoryById = (id: string): Category | undefined =>
  CATEGORIES.find((c) => c.id === id);

// --- vocabulary -------------------------------------------------------------

/** One vocabulary concept: its theme, level, an optional picture cue, and its
 *  word in each language. A pair is only usable when BOTH the known and learning
 *  languages have an entry (see pairs.ts). */
export type VocabItem = PackVocab;

export const VOCAB: VocabItem[] = [];

// --- sentences --------------------------------------------------------------

/** One sentence, tagged with the SAME { category, level } as vocab. */
export type SentenceItem = PackSentence;

export const SENTENCES: SentenceItem[] = [];

// --- prepositions -----------------------------------------------------------

/** One spatial preposition (word per language + the scene it names). */
export type PrepositionItem = PackPreposition;

export const PREPOSITIONS: PrepositionItem[] = [];

// --- keep the app-facing arrays mirroring the merged catalogue --------------
// Splice in place (rather than reassign) so modules that captured these arrays
// at import time — and the many `.filter` / `for..of` callers — keep seeing the
// current content, including after a pack is imported or removed.
registerContentConsumer((content) => {
  LANGUAGES.splice(0, LANGUAGES.length, ...content.languages);
  CATEGORIES.splice(0, CATEGORIES.length, ...content.categories);
  VOCAB.splice(0, VOCAB.length, ...content.vocab);
  SENTENCES.splice(0, SENTENCES.length, ...content.sentences);
  PREPOSITIONS.splice(0, PREPOSITIONS.length, ...content.prepositions);
});
