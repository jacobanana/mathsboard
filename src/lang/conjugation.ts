// VERB CONJUGATION content — the verbs, tenses and person-by-person forms the
// conjugation game teaches, plus a resolver.
//
// Conjugation is per-language: the pronouns and forms live in the LEARNING
// language. Each verb stores its tables PER language code (French and English),
// PER tense — present, imperfect (imparfait) and perfect (passé composé). The
// near future is DERIVED ("je vais manger" / "I will eat"), so it needs no data.
// Levels reuse data.ts's Level so the picker matches the rest of the app.

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
  { id: "imparfait", label: "Imperfect (imparfait)" },
  { id: "passecompose", label: "Perfect (passé composé)" },
  { id: "future", label: "Near future" },
];

export const tenseById = (id: string): Tense | undefined => TENSES.find((t) => t.id === id);

/** Stored tenses per verb (present + the two pasts); future is derived. */
type StoredTense = "present" | "imparfait" | "passecompose";

export interface Verb {
  id: string;
  level: Level;
  /** The infinitive per language: { en: "to be", fr: "être" }. */
  infinitive: Record<LangCode, string>;
  /** Stored tables: forms[langCode][tense] = 6 rows. */
  forms: Record<LangCode, Partial<Record<StoredTense, ConjRow[]>>>;
}

/** Subject pronouns per language, in table order (je, tu, il, nous, vous, ils). */
export const PRONOUNS: Record<LangCode, string[]> = {
  fr: ["je", "tu", "il", "nous", "vous", "ils"],
  en: ["I", "you", "he", "we", "you", "they"],
};

const rows = (prons: string[], forms: string[]): ConjRow[] =>
  prons.map((pronoun, i) => ({ pronoun, form: forms[i] }));
const fr = (...forms: string[]): ConjRow[] => rows(PRONOUNS.fr, forms);
const en = (...forms: string[]): ConjRow[] => rows(PRONOUNS.en, forms);
/** English simple past — the same word for every person ("ate", "had"). */
const enPast = (word: string): ConjRow[] => en(word, word, word, word, word, word);
/** English present perfect — "have/has" + past participle. */
const enPerf = (p: string): ConjRow[] =>
  en(`have ${p}`, `have ${p}`, `has ${p}`, `have ${p}`, `have ${p}`, `have ${p}`);

export const VERBS: Verb[] = [
  {
    id: "etre",
    level: "basic",
    infinitive: { en: "to be", fr: "être" },
    forms: {
      fr: {
        present: fr("suis", "es", "est", "sommes", "êtes", "sont"),
        imparfait: fr("étais", "étais", "était", "étions", "étiez", "étaient"),
        passecompose: fr("ai été", "as été", "a été", "avons été", "avez été", "ont été"),
      },
      en: {
        present: en("am", "are", "is", "are", "are", "are"),
        imparfait: en("was", "were", "was", "were", "were", "were"),
        passecompose: enPerf("been"),
      },
    },
  },
  {
    id: "avoir",
    level: "basic",
    infinitive: { en: "to have", fr: "avoir" },
    forms: {
      fr: {
        present: fr("ai", "as", "a", "avons", "avez", "ont"),
        imparfait: fr("avais", "avais", "avait", "avions", "aviez", "avaient"),
        passecompose: fr("ai eu", "as eu", "a eu", "avons eu", "avez eu", "ont eu"),
      },
      en: {
        present: en("have", "have", "has", "have", "have", "have"),
        imparfait: enPast("had"),
        passecompose: enPerf("had"),
      },
    },
  },
  {
    id: "aller",
    level: "basic",
    infinitive: { en: "to go", fr: "aller" },
    forms: {
      fr: {
        present: fr("vais", "vas", "va", "allons", "allez", "vont"),
        imparfait: fr("allais", "allais", "allait", "allions", "alliez", "allaient"),
        passecompose: fr("suis allé", "es allé", "est allé", "sommes allés", "êtes allés", "sont allés"),
      },
      en: {
        present: en("go", "go", "goes", "go", "go", "go"),
        imparfait: enPast("went"),
        passecompose: enPerf("gone"),
      },
    },
  },
  {
    id: "manger",
    level: "basic",
    infinitive: { en: "to eat", fr: "manger" },
    forms: {
      fr: {
        present: fr("mange", "manges", "mange", "mangeons", "mangez", "mangent"),
        imparfait: fr("mangeais", "mangeais", "mangeait", "mangions", "mangiez", "mangeaient"),
        passecompose: fr("ai mangé", "as mangé", "a mangé", "avons mangé", "avez mangé", "ont mangé"),
      },
      en: {
        present: en("eat", "eat", "eats", "eat", "eat", "eat"),
        imparfait: enPast("ate"),
        passecompose: enPerf("eaten"),
      },
    },
  },
  {
    id: "parler",
    level: "medium",
    infinitive: { en: "to speak", fr: "parler" },
    forms: {
      fr: {
        present: fr("parle", "parles", "parle", "parlons", "parlez", "parlent"),
        imparfait: fr("parlais", "parlais", "parlait", "parlions", "parliez", "parlaient"),
        passecompose: fr("ai parlé", "as parlé", "a parlé", "avons parlé", "avez parlé", "ont parlé"),
      },
      en: {
        present: en("speak", "speak", "speaks", "speak", "speak", "speak"),
        imparfait: enPast("spoke"),
        passecompose: enPerf("spoken"),
      },
    },
  },
  {
    id: "aimer",
    level: "medium",
    infinitive: { en: "to like", fr: "aimer" },
    forms: {
      fr: {
        present: fr("aime", "aimes", "aime", "aimons", "aimez", "aiment"),
        imparfait: fr("aimais", "aimais", "aimait", "aimions", "aimiez", "aimaient"),
        passecompose: fr("ai aimé", "as aimé", "a aimé", "avons aimé", "avez aimé", "ont aimé"),
      },
      en: {
        present: en("like", "like", "likes", "like", "like", "like"),
        imparfait: enPast("liked"),
        passecompose: enPerf("liked"),
      },
    },
  },
  {
    id: "faire",
    level: "medium",
    infinitive: { en: "to do", fr: "faire" },
    forms: {
      fr: {
        present: fr("fais", "fais", "fait", "faisons", "faites", "font"),
        imparfait: fr("faisais", "faisais", "faisait", "faisions", "faisiez", "faisaient"),
        passecompose: fr("ai fait", "as fait", "a fait", "avons fait", "avez fait", "ont fait"),
      },
      en: {
        present: en("do", "do", "does", "do", "do", "do"),
        imparfait: enPast("did"),
        passecompose: enPerf("done"),
      },
    },
  },
  {
    id: "voir",
    level: "advanced",
    infinitive: { en: "to see", fr: "voir" },
    forms: {
      fr: {
        present: fr("vois", "vois", "voit", "voyons", "voyez", "voient"),
        imparfait: fr("voyais", "voyais", "voyait", "voyions", "voyiez", "voyaient"),
        passecompose: fr("ai vu", "as vu", "a vu", "avons vu", "avez vu", "ont vu"),
      },
      en: {
        present: en("see", "see", "sees", "see", "see", "see"),
        imparfait: enPast("saw"),
        passecompose: enPerf("seen"),
      },
    },
  },
  {
    id: "vouloir",
    level: "advanced",
    infinitive: { en: "to want", fr: "vouloir" },
    forms: {
      fr: {
        present: fr("veux", "veux", "veut", "voulons", "voulez", "veulent"),
        imparfait: fr("voulais", "voulais", "voulait", "voulions", "vouliez", "voulaient"),
        passecompose: fr("ai voulu", "as voulu", "a voulu", "avons voulu", "avez voulu", "ont voulu"),
      },
      en: {
        present: en("want", "want", "wants", "want", "want", "want"),
        imparfait: enPast("wanted"),
        passecompose: enPerf("wanted"),
      },
    },
  },
  {
    id: "finir",
    level: "advanced",
    infinitive: { en: "to finish", fr: "finir" },
    forms: {
      fr: {
        present: fr("finis", "finis", "finit", "finissons", "finissez", "finissent"),
        imparfait: fr("finissais", "finissais", "finissait", "finissions", "finissiez", "finissaient"),
        passecompose: fr("ai fini", "as fini", "a fini", "avons fini", "avez fini", "ont fini"),
      },
      en: {
        present: en("finish", "finish", "finishes", "finish", "finish", "finish"),
        imparfait: enPast("finished"),
        passecompose: enPerf("finished"),
      },
    },
  },
];

export const verbById = (id: string): Verb | undefined => VERBS.find((v) => v.id === id);

/** Verbs that have a present table in the learning language. */
export function verbsFor(learning: LangCode, level: Level | "mixed"): Verb[] {
  return VERBS.filter(
    (v) => v.forms[learning]?.present != null && (level === "mixed" || v.level === level),
  );
}

/** Which levels have at least one verb (for the dialog's level dropdown). */
export function verbLevelsFor(learning: LangCode): Level[] {
  const levels: Level[] = ["basic", "medium", "advanced"];
  return levels.filter((l) => verbsFor(learning, l).length > 0);
}

// --- elision (French "je" + a vowel → "j'") ---------------------------------

const VOWELISH = /^[aeiouyàâäéèêëîïôöûüh]/i;

const elidesJe = (row: ConjRow, learning: LangCode): boolean =>
  learning === "fr" && row.pronoun === "je" && VOWELISH.test(row.form);

/** How a row reads written out, e.g. "je suis", "j'ai", "j'ai été", "I am". */
export function displayLine(row: ConjRow, learning: LangCode): string {
  return elidesJe(row, learning) ? "j'" + row.form : row.pronoun + " " + row.form;
}

/**
 * The pronoun as it should PROMPT a form, elision-aware: "je" normally, but "j'"
 * (tight against the form) before a vowel in French — so "j'ai", not "je ai".
 */
export function promptPronoun(row: ConjRow, learning: LangCode): { label: string; tight: boolean } {
  return elidesJe(row, learning) ? { label: "j'", tight: true } : { label: row.pronoun, tight: false };
}

// --- the resolver -----------------------------------------------------------

/** The conjugation rows for a verb + tense in the learning language. Stored
 *  tenses come from the tables; the near future is derived. */
export function conjugationFor(verbId: string, tenseId: string, learning: LangCode): ConjRow[] {
  const verb = verbById(verbId);
  if (!verb) return [];
  if (tenseId === "future") return futureFor(verb, learning);
  return verb.forms[learning]?.[tenseId as StoredTense] ?? [];
}

/** Near future: French "je vais + infinitive" (via aller), English "I will +
 *  base" — both regular across all persons. */
function futureFor(verb: Verb, learning: LangCode): ConjRow[] {
  if (learning === "fr") {
    const aller = verbById("aller")?.forms.fr?.present;
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
