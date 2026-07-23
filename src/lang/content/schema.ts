// THE CONTENT-PACK FORMAT — one portable JSON shape that holds everything the
// language board teaches: the languages, the themes (categories), the subject
// pronouns, and the three content types (vocabulary, sentences and verb
// conjugations). The board's own base content is authored in exactly this shape
// (content/base.json) and loaded through the same path as any imported pack, so
// "the built-in content" and "a pack someone made" are never special-cased.
//
// This module is the single source of truth for the format. It exports:
//   • the TypeScript types a pack must satisfy,
//   • CONTENT_SCHEMA — a JSON Schema (draft-07) users can download to validate
//     or to steer an LLM, kept in lock-step with the types by construction, and
//   • validatePack() — the runtime gate every pack (base or imported) passes
//     through, returning friendly messages rather than throwing.
//
// Adding a language is additive: a new entry in `languages`, its `pronouns`
// row if you want conjugation, and terms keyed by the new code on the items you
// translate. Nothing else in the app needs to change.

/** Difficulty, low → high — shared by vocab and sentences. */
export const LEVELS = ["basic", "medium", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

/** The tense slots a verb stores forms for, in table order (the near future is
 *  derived at runtime, so it is never stored). */
export const STORED_TENSES = ["present", "past", "imperfect", "futureSimple"] as const;
export type StoredTense = (typeof STORED_TENSES)[number];

/** A language the pack teaches or teaches from. */
export interface PackLanguage {
  /** ISO 639-1 code ("en", "fr", "es", …) — the key used everywhere else. */
  code: string;
  /** Name in English, for a neutral menu ("French"). */
  name: string;
  /** The language's own name for itself ("Français"). */
  nativeName: string;
  /** A flag emoji, purely decorative. */
  flag: string;
}

/** A theme both vocab and sentences can be tagged with. */
export interface PackCategory {
  id: string;
  label: string;
  emoji: string;
}

/** One vocabulary concept: theme, level, an optional picture cue, and its word
 *  in each language (keyed by language code). */
export interface PackVocab {
  category: string;
  level: Level;
  emoji?: string;
  terms: Record<string, string>;
  /** Optional pronunciation aid per language code — a romanization / phonetic
   *  reading shown beside the word but NEVER spoken, so text-to-speech reads the
   *  word itself once rather than the word AND its transcription. Meant for
   *  languages whose script the learner can't sound out (e.g. { "ja":
   *  "konnichiwa" } beside こんにちは). Only add entries where they help. */
  phonetics?: Record<string, string>;
}

/** One sentence, tagged with the same { category, level } as vocab. */
export interface PackSentence {
  category: string;
  level: Level;
  terms: Record<string, string>;
  /** Optional pronunciation aid per language code — see {@link PackVocab.phonetics}. */
  phonetics?: Record<string, string>;
}

/** A verb's six stored forms (in pronoun order) for each stored tense. */
export type PackVerbForms = Record<StoredTense, string[]>;

export interface PackVerb {
  id: string;
  level: Level;
  /** The infinitive per language: { en: "to be", fr: "être" }. */
  infinitive: Record<string, string>;
  /** The stored tense tables per language (the near future is derived). */
  forms: Record<string, PackVerbForms>;
}

/** A complete, self-contained content pack. */
export interface ContentPack {
  /** Bumped only on a breaking format change; today's packs are `1`. */
  formatVersion: number;
  /** A stable id ("base", "spanish-food", …) — imported packs replace an
   *  earlier import with the same id. */
  id: string;
  /** A human name shown in the content manager. */
  name: string;
  description?: string;
  languages: PackLanguage[];
  categories: PackCategory[];
  /** Subject pronouns per language, in table order (needed for conjugation). */
  pronouns: Record<string, string[]>;
  vocab: PackVocab[];
  sentences: PackSentence[];
  verbs: PackVerb[];
}

/** The result of flattening the base pack + every imported pack into the
 *  single catalogue the app reads (see content/registry.ts). */
export interface MergedContent {
  languages: PackLanguage[];
  categories: PackCategory[];
  pronouns: Record<string, string[]>;
  vocab: PackVocab[];
  sentences: PackSentence[];
  verbs: PackVerb[];
}

// --- the downloadable JSON Schema -------------------------------------------

/** A JSON Schema (draft-07) for a content pack. Offered as a download from the
 *  content-creation help page and handy to paste into an LLM. Hand-written to
 *  read well as documentation, but kept faithful to the types above. */
export const CONTENT_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://mathsboard.mixedmode.ch/schemas/language-content.schema.json",
  title: "Language Board content pack",
  description:
    "A self-contained pack of language-learning content: languages, themes, pronouns, vocabulary, sentences and verb conjugations. Import as a JSON file to add new languages or content.",
  type: "object",
  required: ["formatVersion", "id", "name", "languages", "categories", "vocab"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string", description: "Optional link back to this schema." },
    formatVersion: {
      type: "integer",
      const: 1,
      description: "The pack format version. Use 1.",
    },
    id: {
      type: "string",
      pattern: "^[a-z0-9-]+$",
      description:
        "A stable id in kebab-case (e.g. \"spanish-starter\"). Re-importing a pack with the same id replaces the earlier one.",
    },
    name: { type: "string", description: "A human-readable name for the pack." },
    description: { type: "string" },
    languages: {
      type: "array",
      minItems: 1,
      description:
        "Every language this pack uses, keyed elsewhere by `code`. Include a language here even if you only add a few terms in it.",
      items: {
        type: "object",
        required: ["code", "name", "nativeName", "flag"],
        additionalProperties: false,
        properties: {
          code: {
            type: "string",
            description: "ISO 639-1 code, e.g. \"en\", \"fr\", \"es\".",
          },
          name: { type: "string", description: "Name in English, e.g. \"Spanish\"." },
          nativeName: {
            type: "string",
            description: "The language's own name, e.g. \"Español\".",
          },
          flag: { type: "string", description: "A flag emoji, decorative." },
        },
      },
    },
    categories: {
      type: "array",
      minItems: 1,
      description: "The themes vocab and sentences are grouped under.",
      items: {
        type: "object",
        required: ["id", "label", "emoji"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            pattern: "^[a-z0-9-]+$",
            description: "kebab-case id used by items' `category`.",
          },
          label: { type: "string", description: "Display name, e.g. \"Food & drink\"." },
          emoji: { type: "string" },
        },
      },
    },
    pronouns: {
      type: "object",
      description:
        "Subject pronouns per language code, in table order (I, you, he, we, you, they). Only needed if the pack has verbs.",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
        minItems: 6,
        maxItems: 6,
      },
    },
    vocab: {
      type: "array",
      description: "Single-word / short-phrase vocabulary.",
      items: {
        type: "object",
        required: ["category", "level", "terms"],
        additionalProperties: false,
        properties: {
          category: { type: "string", description: "A category id from `categories`." },
          level: { enum: ["basic", "medium", "advanced"] },
          emoji: { type: "string", description: "Optional picture cue." },
          terms: {
            type: "object",
            description:
              "The word in each language, keyed by language code. An item is only used for a pair when BOTH sides have a term.",
            additionalProperties: { type: "string" },
            minProperties: 1,
          },
          phonetics: {
            type: "object",
            description:
              "Optional pronunciation aid per language code (e.g. a romanization). Shown beside the word but NEVER read aloud by text-to-speech. Use for languages whose script the learner can't sound out — put the reading HERE, not inside `terms`, so speech reads the word once, not the word and its transcription.",
            additionalProperties: { type: "string" },
          },
        },
      },
    },
    sentences: {
      type: "array",
      description: "Full sentences, tagged with the same categories and levels.",
      items: {
        type: "object",
        required: ["category", "level", "terms"],
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          level: { enum: ["basic", "medium", "advanced"] },
          terms: {
            type: "object",
            additionalProperties: { type: "string" },
            minProperties: 1,
          },
          phonetics: {
            type: "object",
            description:
              "Optional pronunciation aid per language code, shown beside the sentence but never spoken. Same rule as vocab: keep readings out of `terms`.",
            additionalProperties: { type: "string" },
          },
        },
      },
    },
    verbs: {
      type: "array",
      description:
        "Verb conjugations for the conjugation game. Each stored tense holds six forms in pronoun order (je, tu, il, nous, vous, ils).",
      items: {
        type: "object",
        required: ["id", "level", "infinitive", "forms"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z0-9-]+$" },
          level: { enum: ["basic", "medium", "advanced"] },
          infinitive: {
            type: "object",
            description: "The infinitive per language code, e.g. { \"en\": \"to be\", \"fr\": \"être\" }.",
            additionalProperties: { type: "string" },
            minProperties: 1,
          },
          forms: {
            type: "object",
            description: "Per language code, the stored tense tables.",
            additionalProperties: {
              type: "object",
              required: ["present", "past", "imperfect", "futureSimple"],
              additionalProperties: false,
              properties: {
                present: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 6 },
                past: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 6 },
                imperfect: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 6 },
                futureSimple: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 6 },
              },
            },
          },
        },
      },
    },
  },
} as const;

// --- validation -------------------------------------------------------------

export type ValidationResult =
  | { ok: true; pack: ContentPack }
  | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isLevel = (v: unknown): v is Level => v === "basic" || v === "medium" || v === "advanced";

/** A record whose values are all non-empty strings (terms / infinitive maps). */
function termsErrors(terms: unknown, where: string, errors: string[]): void {
  if (!isObj(terms)) {
    errors.push(`${where}: "terms" must be an object of { languageCode: word }.`);
    return;
  }
  const keys = Object.keys(terms);
  if (keys.length === 0) errors.push(`${where}: "terms" has no languages.`);
  for (const k of keys) {
    if (!isStr(terms[k]) || (terms[k] as string).trim() === "")
      errors.push(`${where}: term for "${k}" must be a non-empty string.`);
  }
}

/** The optional `phonetics` map: when present it must be { languageCode: reading }
 *  with non-empty string readings. Absent is always fine (it is optional). */
function phoneticsErrors(phonetics: unknown, where: string, errors: string[]): void {
  if (phonetics === undefined) return;
  if (!isObj(phonetics)) {
    errors.push(`${where}: "phonetics" must be an object of { languageCode: reading }.`);
    return;
  }
  for (const k of Object.keys(phonetics)) {
    if (!isStr(phonetics[k]) || (phonetics[k] as string).trim() === "")
      errors.push(`${where}: phonetics for "${k}" must be a non-empty string.`);
  }
}

/**
 * Validate an arbitrary parsed value as a ContentPack. Deliberately forgiving
 * on the optional pieces (a vocab-only pack is fine) but strict on the shapes
 * that would break the resolvers — six forms per stored tense, terms keyed by
 * language code, known category/level values. Messages name the offending item
 * so an author (or an LLM asked to "fix the errors") can act on them.
 */
export function validatePack(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(value)) return { ok: false, errors: ["The file is not a JSON object."] };

  if (value.formatVersion !== 1)
    errors.push('"formatVersion" must be 1.');
  if (!isStr(value.id) || !/^[a-z0-9-]+$/.test(value.id))
    errors.push('"id" must be a kebab-case string (letters, digits, dashes).');
  if (!isStr(value.name) || value.name.trim() === "")
    errors.push('"name" must be a non-empty string.');

  // languages
  const codes = new Set<string>();
  if (!Array.isArray(value.languages) || value.languages.length === 0) {
    errors.push('"languages" must be a non-empty array.');
  } else {
    value.languages.forEach((l, i) => {
      if (!isObj(l)) return errors.push(`languages[${i}] must be an object.`);
      for (const f of ["code", "name", "nativeName", "flag"]) {
        if (!isStr(l[f]) || (l[f] as string).trim() === "")
          errors.push(`languages[${i}].${f} must be a non-empty string.`);
      }
      if (isStr(l.code)) codes.add(l.code);
    });
  }

  // categories
  const catIds = new Set<string>();
  if (!Array.isArray(value.categories) || value.categories.length === 0) {
    errors.push('"categories" must be a non-empty array.');
  } else {
    value.categories.forEach((c, i) => {
      if (!isObj(c)) return errors.push(`categories[${i}] must be an object.`);
      for (const f of ["id", "label", "emoji"]) {
        if (!isStr(c[f]) || (c[f] as string).trim() === "")
          errors.push(`categories[${i}].${f} must be a non-empty string.`);
      }
      if (isStr(c.id)) catIds.add(c.id);
    });
  }

  const knownCat = (cat: unknown, where: string) => {
    if (!isStr(cat) || cat.trim() === "") errors.push(`${where}: "category" is missing.`);
    else if (catIds.size > 0 && !catIds.has(cat))
      errors.push(`${where}: category "${cat}" is not declared in "categories".`);
  };

  // vocab (optional but validated when present)
  if (value.vocab !== undefined) {
    if (!Array.isArray(value.vocab)) errors.push('"vocab" must be an array.');
    else
      value.vocab.forEach((it, i) => {
        if (!isObj(it)) return errors.push(`vocab[${i}] must be an object.`);
        knownCat(it.category, `vocab[${i}]`);
        if (!isLevel(it.level)) errors.push(`vocab[${i}]: level must be basic, medium or advanced.`);
        termsErrors(it.terms, `vocab[${i}]`, errors);
        phoneticsErrors(it.phonetics, `vocab[${i}]`, errors);
      });
  }

  // sentences
  if (value.sentences !== undefined) {
    if (!Array.isArray(value.sentences)) errors.push('"sentences" must be an array.');
    else
      value.sentences.forEach((it, i) => {
        if (!isObj(it)) return errors.push(`sentences[${i}] must be an object.`);
        knownCat(it.category, `sentences[${i}]`);
        if (!isLevel(it.level)) errors.push(`sentences[${i}]: level must be basic, medium or advanced.`);
        termsErrors(it.terms, `sentences[${i}]`, errors);
        phoneticsErrors(it.phonetics, `sentences[${i}]`, errors);
      });
  }

  // pronouns
  if (value.pronouns !== undefined) {
    if (!isObj(value.pronouns)) errors.push('"pronouns" must be an object of { languageCode: [6 pronouns] }.');
    else
      for (const [code, list] of Object.entries(value.pronouns)) {
        if (!Array.isArray(list) || list.length !== 6 || !list.every((p) => isStr(p) && p.trim() !== ""))
          errors.push(`pronouns.${code} must be an array of 6 non-empty strings.`);
      }
  }

  // verbs
  if (value.verbs !== undefined) {
    if (!Array.isArray(value.verbs)) errors.push('"verbs" must be an array.');
    else
      value.verbs.forEach((vb, i) => {
        if (!isObj(vb)) return errors.push(`verbs[${i}] must be an object.`);
        if (!isStr(vb.id) || vb.id.trim() === "") errors.push(`verbs[${i}].id must be a non-empty string.`);
        if (!isLevel(vb.level)) errors.push(`verbs[${i}]: level must be basic, medium or advanced.`);
        termsErrors(vb.infinitive, `verbs[${i}].infinitive`, errors);
        if (!isObj(vb.forms)) {
          errors.push(`verbs[${i}].forms must be an object keyed by language code.`);
        } else {
          for (const [code, table] of Object.entries(vb.forms)) {
            if (!isObj(table)) {
              errors.push(`verbs[${i}].forms.${code} must be an object of tense tables.`);
              continue;
            }
            for (const tense of STORED_TENSES) {
              const forms = table[tense];
              if (!Array.isArray(forms) || forms.length !== 6 || !forms.every((f) => isStr(f) && f.trim() !== ""))
                errors.push(`verbs[${i}].forms.${code}.${tense} must be an array of 6 non-empty strings.`);
            }
          }
        }
      });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, pack: value as unknown as ContentPack };
}
