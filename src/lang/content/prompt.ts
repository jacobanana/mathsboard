// THE CONTENT-CREATION PROMPT — a ready-to-use LLM prompt the content page
// offers for copy/download. Paste it into any capable model, and it returns a
// content pack that imports straight into the Language Board.
//
// IMPORTANT: the prompt is GENERATED from the schema (schema.ts), not written
// out by hand. The volatile bits — the allowed levels, the stored tenses, the
// pronoun/form count, the required fields — are read from CONTENT_SCHEMA and its
// sibling constants, and the full JSON Schema is embedded verbatim at the end.
// So when the format changes, this prompt changes with it and can never drift
// out of sync with what the app will actually accept.

import baseJson from "@/lang/content/base.json";
import {
  CONTENT_SCHEMA,
  LEVELS,
  STORED_TENSES,
  type ContentPack,
} from "@/lang/content/schema";

/** The app's built-in themes, offered to the model as a *starting point* only —
 *  it is free to invent categories that suit the age and theme. Sourced from the
 *  base pack so this list always mirrors the app's own themes. */
export const SUGGESTED_CATEGORIES: readonly string[] = (
  baseJson as unknown as ContentPack
).categories.map((c) => c.id);

/** How many subject pronouns / verb forms a row holds — read from the schema so
 *  the prompt can never disagree with the validator. */
const FORM_COUNT: number =
  CONTENT_SCHEMA.properties.pronouns.additionalProperties.minItems;

/** The format version the schema pins to. */
const FORMAT_VERSION: number = CONTENT_SCHEMA.properties.formatVersion.const;

/** The inputs the little form on the content page collects. All optional — an
 *  empty field simply leaves that choice to whoever runs the prompt. */
export interface PromptOptions {
  /** Language the learner already speaks (e.g. "English"). */
  knownLanguage: string;
  /** Language to teach (e.g. "Spanish"). */
  targetLanguage: string;
  /** Target age or range (e.g. "8–11"). */
  ageTarget: string;
  /** An optional slant for the content (e.g. "space", "football"). */
  theme: string;
  /** Anything else the author wants to steer. */
  specialInstructions: string;
}

export const DEFAULT_OPTIONS: PromptOptions = {
  knownLanguage: "English",
  targetLanguage: "",
  ageTarget: "8–11",
  theme: "",
  specialInstructions: "",
};

/** The suggested minimum number of sentences. 30 (the old default) is not enough
 *  for real practice, so the prompt asks for a lot more. */
const SUGGESTED_SENTENCE_MIN = 75;

/**
 * Build the content-creation prompt, tailored by the form options. Everything
 * format-specific is derived from the schema, so the guidance and the embedded
 * JSON Schema always match what {@link validatePack} enforces.
 */
export function buildLlmPrompt(opts: Partial<PromptOptions> = {}): string {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const known = o.knownLanguage.trim() || "English";
  const target = o.targetLanguage.trim() || "<the language you want to teach>";
  const age = o.ageTarget.trim() || "8–11";
  const theme = o.theme.trim();
  const notes = o.specialInstructions.trim();

  const levels = LEVELS.map((l) => `"${l}"`).join(", ");
  const tenses = STORED_TENSES.join(", ");
  const suggestedCats = SUGGESTED_CATEGORIES.join(", ");
  const required = (CONTENT_SCHEMA.required as readonly string[]).join(", ");

  const themeLine = theme
    ? `Theme / slant: ${theme} — lean the vocabulary, sentences and examples toward this where it fits naturally.`
    : `Theme / slant: none in particular — cover everyday life across many themes.`;

  const notesBlock = notes
    ? `\n## Special instructions\n${notes}\n`
    : "";

  return `You are helping build content for the Language Board, a whiteboard app that teaches languages to children. Produce ONE self-contained JSON "content pack" that imports straight into the app.

## What I want
Language to teach: ${target}
Language the learner already knows: ${known}
Target age: ${age}
${themeLine}

Generate rich, age-appropriate content: vocabulary, sentences, and verb conjugations. Aim for breadth and cover all three difficulty levels (${levels}).
${notesBlock}
## Output rules
- Output ONLY the JSON — no prose, no markdown fences.
- Required top-level fields: ${required}.
- "formatVersion": ${FORMAT_VERSION}.
- "id": a short kebab-case id, e.g. "spanish-starter".
- "name": a human-readable name, e.g. "Spanish starter (${known} → ${target})".
- "languages": include EVERY language used, each with { code (ISO 639-1), name (in English), nativeName, flag (emoji) }. Include the learner's language (${known}) too, so pairs resolve.
- "categories": the themes items are grouped under, each { id (kebab-case), label, emoji }. THESE ARE YOURS TO CHOOSE — invent whatever themes suit the age and theme above. As a starting point, the app already knows these themes, and reusing their ids makes your pack line up with the built-in content: ${suggestedCats}. Feel free to rename, drop or add to them.
- Every vocab and sentence item has: "category" (an id from your categories), "level" (${levels}), and "terms": a map of languageCode → word/sentence. ALWAYS include BOTH the taught language AND the learner's language in "terms" — an item is only usable when both sides are present. "emoji" is optional on vocab.
- "phonetics" (OPTIONAL, on vocab and sentences): a map languageCode → pronunciation, for languages whose script the learner can't sound out (Japanese, Chinese, Korean, Arabic, Russian, Greek, …). Put the romanization/reading HERE — NEVER inside "terms". Keeping "terms" clean means text-to-speech reads the real word once (not the word AND its transcription), while the app still shows the reading beside it. E.g. terms { "en": "hello", "ja": "こんにちは" } with phonetics { "ja": "konnichiwa" }. Omit it for languages the learner can already read (no phonetics for Spanish, French, etc.).
- "pronouns": for each language that has verbs, ${FORM_COUNT} subject pronouns in order [I, you, he/she, we, you-plural, they].
- "verbs": each has "id" (kebab-case), "level", "infinitive" (map languageCode → infinitive, e.g. {"en":"to be","es":"ser"}), and "forms": a map languageCode → { ${STORED_TENSES.map((t) => `"${t}":[${FORM_COUNT}]`).join(", ")} }. Each tense array has EXACTLY ${FORM_COUNT} forms, in the same pronoun order as above. Give the ${known} forms too. Store only these tenses (${tenses}) — the app derives the near future itself.

## Suggested size (a starting point, go bigger where you can)
- ~120+ vocab items spread across the themes and levels.
- ${SUGGESTED_SENTENCE_MIN}+ sentences — this matters: 30 is not enough for real practice, so aim for at least ${SUGGESTED_SENTENCE_MIN}. Build them out of the vocabulary and verbs you put in THIS pack, so learners meet familiar words in context. Keep basic sentences short and literal; let advanced ones run longer and use more tenses and connectors.
- ~8–10 common verbs.

## Example shape (abbreviated — any language, this one happens to be Spanish)
{
  "formatVersion": ${FORMAT_VERSION},
  "id": "spanish-starter",
  "name": "Spanish starter (English → Spanish)",
  "languages": [
    { "code": "en", "name": "English", "nativeName": "English", "flag": "🇬🇧" },
    { "code": "es", "name": "Spanish", "nativeName": "Español", "flag": "🇪🇸" }
  ],
  "categories": [
    { "id": "greetings", "label": "Greetings", "emoji": "👋" },
    { "id": "colours", "label": "Colours", "emoji": "🎨" }
  ],
  "pronouns": {
    "en": ["I","you","he","we","you","they"],
    "es": ["yo","tú","él","nosotros","vosotros","ellos"]
  },
  "vocab": [
    { "category": "greetings", "level": "basic", "emoji": "👋", "terms": { "en": "hello", "es": "hola" } },
    { "category": "colours", "level": "basic", "emoji": "🔴", "terms": { "en": "red", "es": "rojo" } }
  ],
  "sentences": [
    { "category": "greetings", "level": "basic", "terms": { "en": "Hello!", "es": "¡Hola!" } }
  ],
  "verbs": [
    {
      "id": "ser",
      "level": "basic",
      "infinitive": { "en": "to be", "es": "ser" },
      "forms": {
        "es": { "present": ["soy","eres","es","somos","sois","son"], "past": ["fui","fuiste","fue","fuimos","fuisteis","fueron"], "imperfect": ["era","eras","era","éramos","erais","eran"], "futureSimple": ["seré","serás","será","seremos","seréis","serán"] },
        "en": { "present": ["am","are","is","are","are","are"], "past": ["was","were","was","were","were","were"], "imperfect": ["used to be","used to be","used to be","used to be","used to be","used to be"], "futureSimple": ["will be","will be","will be","will be","will be","will be"] }
      }
    }
  ]
}

## The exact format (JSON Schema — your output must validate against this)
${JSON.stringify(CONTENT_SCHEMA, null, 2)}

Now generate the full pack.`;
}

/** The prompt with default options — the value shown before the form is touched
 *  and a stable export for anything that just wants "the prompt". */
export const LLM_PROMPT = buildLlmPrompt();
