// VERB CONJUGATION content — the verbs, tenses and person-by-person forms the
// conjugation game teaches, plus a resolver.
//
// Conjugation is inherently per-language: the pronouns and forms live in the
// LEARNING language. So each verb stores its tables PER language code (French
// and English to begin with), and the game reads the table for the pair's
// learning language. Levels reuse data.ts's Level, so the picker matches the
// rest of the app.
//
// FIVE tenses are offered. Four are STORED per language because the forms are
// irregular enough that deriving them would be wrong (être → serai, aller →
// irai, faire → faisais …): the present, the perfect past (passé composé /
// simple past), the imperfect (imparfait) and the simple future (futur simple).
// The near future ("futur proche" — je vais + infinitive; English "going to")
// stays DERIVED so it is always regular and beginner-friendly.

import type { LangCode, Level } from "@/lang/data";
import { registerContentConsumer } from "@/lang/content/registry";
import type {
  PackVerb,
  PackVerbForms,
  StoredTense as PackStoredTense,
} from "@/lang/content/schema";

/** One person's line of a conjugation: the pronoun and the verb form. */
export interface ConjRow {
  pronoun: string;
  form: string;
}

export interface Tense {
  id: string;
  label: string;
}

/** The tenses the game offers, in teaching order. `future` is the DERIVED near
 *  future (kept under its original id so already-placed widgets still resolve);
 *  the others are stored per verb. */
export const TENSES: Tense[] = [
  { id: "present", label: "Present" },
  { id: "past", label: "Past" }, // passé composé / simple past
  { id: "imperfect", label: "Imperfect" }, // imparfait
  { id: "future", label: "Near future" }, // futur proche (derived)
  { id: "futureSimple", label: "Future" }, // futur simple
];

/** The tenses whose forms are stored on each verb (everything but the near
 *  future, which is derived). */
export type StoredTense = PackStoredTense;

export const tenseById = (id: string): Tense | undefined => TENSES.find((t) => t.id === id);

/** A verb's stored tables: the six forms (in pronoun order) for each stored
 *  tense. */
export type VerbForms = PackVerbForms;

export type Verb = PackVerb;

/** Subject pronouns per language, in table order (je, tu, il, nous, vous, ils).
 *  Populated from the loaded content packs. */
export const PRONOUNS: Record<LangCode, string[]> = {};

/** The verbs the conjugation game teaches — built-in plus any imported pack's,
 *  kept in sync in place by the content registry. */
export const VERBS: Verb[] = [];

registerContentConsumer((content) => {
  for (const code of Object.keys(PRONOUNS)) delete PRONOUNS[code];
  Object.assign(PRONOUNS, content.pronouns);
  VERBS.splice(0, VERBS.length, ...content.verbs);
});

export const verbById = (id: string): Verb | undefined => VERBS.find((v) => v.id === id);

/** Verbs that have a table in the learning language (all of them, for now). */
export function verbsFor(learning: LangCode, level: Level | "mixed"): Verb[] {
  return VERBS.filter(
    (v) => v.forms[learning] != null && (level === "mixed" || v.level === level),
  );
}

/** Which levels have at least one verb (for the dialog's level buttons). */
export function verbLevelsFor(learning: LangCode): Level[] {
  const levels: Level[] = ["basic", "medium", "advanced"];
  return levels.filter((l) => verbsFor(learning, l).length > 0);
}

// --- elision (French "je" + a vowel → "j'") ---------------------------------

const VOWELISH = /^[aeiouyàâäéèêëîïôöûü]/i;

/** True when the row's subject elides in French — "je" before a vowel sound,
 *  as in "j'ai", "j'aime", "j'ai mangé". */
export function elides(row: ConjRow, learning: LangCode): boolean {
  return learning === "fr" && row.pronoun === "je" && VOWELISH.test(row.form);
}

/** The subject exactly as it is written before the form — "je", "tu", … or the
 *  elided "j'" (with no trailing space) before a vowel in French. */
export function subjectOf(row: ConjRow, learning: LangCode): string {
  return elides(row, learning) ? "j'" : row.pronoun;
}

/** How a row reads written out, e.g. "je suis", "j'ai", "I am". */
export function displayLine(row: ConjRow, learning: LangCode): string {
  return elides(row, learning) ? "j'" + row.form : row.pronoun + " " + row.form;
}

// --- the resolver -----------------------------------------------------------

const zip = (learning: LangCode, forms: string[] | undefined): ConjRow[] => {
  if (!forms) return [];
  return PRONOUNS[learning].map((pronoun, i) => ({ pronoun, form: forms[i] }));
};

/** The conjugation rows for a verb + tense in the learning language. The stored
 *  tenses come straight from the verb; the near future ("future") is derived. */
export function conjugationFor(
  verbId: string,
  tenseId: string,
  learning: LangCode,
): ConjRow[] {
  const verb = verbById(verbId);
  const table = verb?.forms[learning];
  if (!verb || !table) return [];
  if (tenseId === "future") return futureFor(verb, learning);
  const stored = table[tenseId as StoredTense];
  return stored ? zip(learning, stored) : [];
}

/** Near future: French "je vais + infinitive" (via aller), English "I am going
 *  to + base" — both regular across all persons. */
function futureFor(verb: Verb, learning: LangCode): ConjRow[] {
  if (learning === "fr") {
    const aller = verbById("aller")?.forms.fr.present;
    const inf = verb.infinitive.fr;
    if (!aller || !inf) return [];
    return PRONOUNS.fr.map((pronoun, i) => ({ pronoun, form: `${aller[i]} ${inf}` }));
  }
  if (learning === "en") {
    const base = verb.infinitive.en.replace(/^to\s+/, "");
    const goingTo: Record<string, string> = {
      I: "am going to",
      you: "are going to",
      he: "is going to",
      we: "are going to",
      they: "are going to",
    };
    return PRONOUNS.en.map((pronoun) => ({
      pronoun,
      form: `${goingTo[pronoun] ?? "are going to"} ${base}`,
    }));
  }
  return [];
}

/** The verb's infinitive in a language (falls back to the id). */
export const infinitiveOf = (verb: Verb, code: LangCode): string =>
  verb.infinitive[code] ?? verb.id;
