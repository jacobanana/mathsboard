// VERB CONJUGATION content — the verbs, tenses and person-by-person forms the
// conjugation game teaches, plus a resolver.
//
// Conjugation is inherently per-language: the pronouns and forms live in the
// LEARNING language. So each verb stores its present-tense table PER language
// code (French and English to begin with), and the game reads the table for the
// pair's learning language. Levels reuse data.ts's Level, so the picker matches
// the rest of the app.
//
// The present tense is stored; the near-future ("futur proche" in French, "will
// …" in English) is DERIVED so a second tense comes for free and stays regular
// and beginner-friendly.

import type { LangCode, Level } from "@/lang/data";

/** One person's line of a conjugation: the pronoun and the verb form. */
export interface ConjRow {
  pronoun: string;
  form: string;
}

export interface Tense {
  id: string;
  label: string;
}

export const TENSES: Tense[] = [
  { id: "present", label: "Present" },
  { id: "future", label: "Near future" },
];

export const tenseById = (id: string): Tense | undefined => TENSES.find((t) => t.id === id);

export interface Verb {
  id: string;
  level: Level;
  /** The infinitive per language: { en: "to be", fr: "être" }. */
  infinitive: Record<LangCode, string>;
  /** The PRESENT-tense rows per language (other tenses are derived). */
  present: Record<LangCode, ConjRow[]>;
}

/** Subject pronouns per language, in table order (je, tu, il, nous, vous, ils). */
export const PRONOUNS: Record<LangCode, string[]> = {
  fr: ["je", "tu", "il", "nous", "vous", "ils"],
  en: ["I", "you", "he", "we", "you", "they"],
};

const fr = (...forms: string[]): ConjRow[] =>
  PRONOUNS.fr.map((pronoun, i) => ({ pronoun, form: forms[i] }));
const en = (...forms: string[]): ConjRow[] =>
  PRONOUNS.en.map((pronoun, i) => ({ pronoun, form: forms[i] }));

export const VERBS: Verb[] = [
  {
    id: "etre",
    level: "basic",
    infinitive: { en: "to be", fr: "être" },
    present: {
      fr: fr("suis", "es", "est", "sommes", "êtes", "sont"),
      en: en("am", "are", "is", "are", "are", "are"),
    },
  },
  {
    id: "avoir",
    level: "basic",
    infinitive: { en: "to have", fr: "avoir" },
    present: {
      fr: fr("ai", "as", "a", "avons", "avez", "ont"),
      en: en("have", "have", "has", "have", "have", "have"),
    },
  },
  {
    id: "aller",
    level: "basic",
    infinitive: { en: "to go", fr: "aller" },
    present: {
      fr: fr("vais", "vas", "va", "allons", "allez", "vont"),
      en: en("go", "go", "goes", "go", "go", "go"),
    },
  },
  {
    id: "manger",
    level: "basic",
    infinitive: { en: "to eat", fr: "manger" },
    present: {
      fr: fr("mange", "manges", "mange", "mangeons", "mangez", "mangent"),
      en: en("eat", "eat", "eats", "eat", "eat", "eat"),
    },
  },
  {
    id: "parler",
    level: "medium",
    infinitive: { en: "to speak", fr: "parler" },
    present: {
      fr: fr("parle", "parles", "parle", "parlons", "parlez", "parlent"),
      en: en("speak", "speak", "speaks", "speak", "speak", "speak"),
    },
  },
  {
    id: "aimer",
    level: "medium",
    infinitive: { en: "to like", fr: "aimer" },
    present: {
      fr: fr("aime", "aimes", "aime", "aimons", "aimez", "aiment"),
      en: en("like", "like", "likes", "like", "like", "like"),
    },
  },
  {
    id: "faire",
    level: "medium",
    infinitive: { en: "to do", fr: "faire" },
    present: {
      fr: fr("fais", "fais", "fait", "faisons", "faites", "font"),
      en: en("do", "do", "does", "do", "do", "do"),
    },
  },
  {
    id: "voir",
    level: "advanced",
    infinitive: { en: "to see", fr: "voir" },
    present: {
      fr: fr("vois", "vois", "voit", "voyons", "voyez", "voient"),
      en: en("see", "see", "sees", "see", "see", "see"),
    },
  },
  {
    id: "vouloir",
    level: "advanced",
    infinitive: { en: "to want", fr: "vouloir" },
    present: {
      fr: fr("veux", "veux", "veut", "voulons", "voulez", "veulent"),
      en: en("want", "want", "wants", "want", "want", "want"),
    },
  },
  {
    id: "finir",
    level: "advanced",
    infinitive: { en: "to finish", fr: "finir" },
    present: {
      fr: fr("finis", "finis", "finit", "finissons", "finissez", "finissent"),
      en: en("finish", "finish", "finishes", "finish", "finish", "finish"),
    },
  },
];

export const verbById = (id: string): Verb | undefined => VERBS.find((v) => v.id === id);

/** Verbs that have a table in the learning language (all of them, for now). */
export function verbsFor(learning: LangCode, level: Level | "mixed"): Verb[] {
  return VERBS.filter(
    (v) => v.present[learning] != null && (level === "mixed" || v.level === level),
  );
}

/** Which levels have at least one verb (for the dialog's level buttons). */
export function verbLevelsFor(learning: LangCode): Level[] {
  const levels: Level[] = ["basic", "medium", "advanced"];
  return levels.filter((l) => verbsFor(learning, l).length > 0);
}

// --- elision (French "je" + a vowel → "j'") ---------------------------------

const VOWELISH = /^[aeiouyàâäéèêëîïôöûü]/i;

/** How a row reads written out, e.g. "je suis", "j'ai", "I am". */
export function displayLine(row: ConjRow, learning: LangCode): string {
  if (learning === "fr" && row.pronoun === "je" && VOWELISH.test(row.form)) {
    return "j'" + row.form;
  }
  return row.pronoun + " " + row.form;
}

// --- the resolver -----------------------------------------------------------

/** The conjugation rows for a verb + tense in the learning language. Present is
 *  stored; the near future is derived (regular and beginner-friendly). */
export function conjugationFor(
  verbId: string,
  tenseId: string,
  learning: LangCode,
): ConjRow[] {
  const verb = verbById(verbId);
  const present = verb?.present[learning];
  if (!verb || !present) return [];
  if (tenseId === "present") return present;
  if (tenseId === "future") return futureFor(verb, learning);
  return [];
}

/** Near future: French "je vais + infinitive" (via aller), English "I will +
 *  base" — both regular across all persons. */
function futureFor(verb: Verb, learning: LangCode): ConjRow[] {
  if (learning === "fr") {
    const aller = verbById("aller")?.present.fr;
    const inf = verb.infinitive.fr;
    if (!aller || !inf) return [];
    return aller.map((r) => ({ pronoun: r.pronoun, form: `${r.form} ${inf}` }));
  }
  if (learning === "en") {
    const base = verb.infinitive.en.replace(/^to\s+/, "");
    return PRONOUNS.en.map((pronoun) => ({ pronoun, form: `will ${base}` }));
  }
  return [];
}

/** The verb's infinitive in a language (falls back to the id). */
export const infinitiveOf = (verb: Verb, code: LangCode): string =>
  verb.infinitive[code] ?? verb.id;
