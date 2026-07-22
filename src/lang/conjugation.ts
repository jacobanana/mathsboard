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
export type StoredTense = "present" | "past" | "imperfect" | "futureSimple";

export const tenseById = (id: string): Tense | undefined => TENSES.find((t) => t.id === id);

/** A verb's stored tables: the six forms (in pronoun order) for each stored
 *  tense. */
export type VerbForms = Record<StoredTense, string[]>;

export interface Verb {
  id: string;
  level: Level;
  /** The infinitive per language: { en: "to be", fr: "être" }. */
  infinitive: Record<LangCode, string>;
  /** The stored tense tables per language (the near future is derived). */
  forms: Record<LangCode, VerbForms>;
}

/** Subject pronouns per language, in table order (je, tu, il, nous, vous, ils). */
export const PRONOUNS: Record<LangCode, string[]> = {
  fr: ["je", "tu", "il", "nous", "vous", "ils"],
  en: ["I", "you", "he", "we", "you", "they"],
};

/** Build a verb entry, keeping the long catalogue below readable. */
const verb = (
  id: string,
  level: Level,
  infinitive: Record<LangCode, string>,
  fr: VerbForms,
  en: VerbForms,
): Verb => ({ id, level, infinitive, forms: { fr, en } });

/** English past/imperfect/future are regular around a base, so a tiny helper
 *  keeps the English column terse: base for the simple past is given, the
 *  imperfect is "used to <inf>", the future "will <inf>". */
const enForms = (
  present: string[],
  simplePast: string,
  base: string,
): VerbForms => ({
  present,
  past: Array(6).fill(simplePast),
  imperfect: Array(6).fill(`used to ${base}`),
  futureSimple: Array(6).fill(`will ${base}`),
});

export const VERBS: Verb[] = [
  verb(
    "etre",
    "basic",
    { en: "to be", fr: "être" },
    {
      present: ["suis", "es", "est", "sommes", "êtes", "sont"],
      past: ["ai été", "as été", "a été", "avons été", "avez été", "ont été"],
      imperfect: ["étais", "étais", "était", "étions", "étiez", "étaient"],
      futureSimple: ["serai", "seras", "sera", "serons", "serez", "seront"],
    },
    {
      present: ["am", "are", "is", "are", "are", "are"],
      past: ["was", "were", "was", "were", "were", "were"],
      imperfect: Array(6).fill("used to be"),
      futureSimple: Array(6).fill("will be"),
    },
  ),
  verb(
    "avoir",
    "basic",
    { en: "to have", fr: "avoir" },
    {
      present: ["ai", "as", "a", "avons", "avez", "ont"],
      past: ["ai eu", "as eu", "a eu", "avons eu", "avez eu", "ont eu"],
      imperfect: ["avais", "avais", "avait", "avions", "aviez", "avaient"],
      futureSimple: ["aurai", "auras", "aura", "aurons", "aurez", "auront"],
    },
    {
      present: ["have", "have", "has", "have", "have", "have"],
      past: Array(6).fill("had"),
      imperfect: Array(6).fill("used to have"),
      futureSimple: Array(6).fill("will have"),
    },
  ),
  verb(
    "aller",
    "basic",
    { en: "to go", fr: "aller" },
    {
      present: ["vais", "vas", "va", "allons", "allez", "vont"],
      // passé composé with être — masculine forms (the beginner default).
      past: ["suis allé", "es allé", "est allé", "sommes allés", "êtes allés", "sont allés"],
      imperfect: ["allais", "allais", "allait", "allions", "alliez", "allaient"],
      futureSimple: ["irai", "iras", "ira", "irons", "irez", "iront"],
    },
    enForms(["go", "go", "goes", "go", "go", "go"], "went", "go"),
  ),
  verb(
    "manger",
    "basic",
    { en: "to eat", fr: "manger" },
    {
      present: ["mange", "manges", "mange", "mangeons", "mangez", "mangent"],
      past: ["ai mangé", "as mangé", "a mangé", "avons mangé", "avez mangé", "ont mangé"],
      imperfect: ["mangeais", "mangeais", "mangeait", "mangions", "mangiez", "mangeaient"],
      futureSimple: ["mangerai", "mangeras", "mangera", "mangerons", "mangerez", "mangeront"],
    },
    enForms(["eat", "eat", "eats", "eat", "eat", "eat"], "ate", "eat"),
  ),
  verb(
    "parler",
    "medium",
    { en: "to speak", fr: "parler" },
    {
      present: ["parle", "parles", "parle", "parlons", "parlez", "parlent"],
      past: ["ai parlé", "as parlé", "a parlé", "avons parlé", "avez parlé", "ont parlé"],
      imperfect: ["parlais", "parlais", "parlait", "parlions", "parliez", "parlaient"],
      futureSimple: ["parlerai", "parleras", "parlera", "parlerons", "parlerez", "parleront"],
    },
    enForms(["speak", "speak", "speaks", "speak", "speak", "speak"], "spoke", "speak"),
  ),
  verb(
    "aimer",
    "medium",
    { en: "to like", fr: "aimer" },
    {
      present: ["aime", "aimes", "aime", "aimons", "aimez", "aiment"],
      past: ["ai aimé", "as aimé", "a aimé", "avons aimé", "avez aimé", "ont aimé"],
      imperfect: ["aimais", "aimais", "aimait", "aimions", "aimiez", "aimaient"],
      futureSimple: ["aimerai", "aimeras", "aimera", "aimerons", "aimerez", "aimeront"],
    },
    enForms(["like", "like", "likes", "like", "like", "like"], "liked", "like"),
  ),
  verb(
    "faire",
    "medium",
    { en: "to do", fr: "faire" },
    {
      present: ["fais", "fais", "fait", "faisons", "faites", "font"],
      past: ["ai fait", "as fait", "a fait", "avons fait", "avez fait", "ont fait"],
      imperfect: ["faisais", "faisais", "faisait", "faisions", "faisiez", "faisaient"],
      futureSimple: ["ferai", "feras", "fera", "ferons", "ferez", "feront"],
    },
    enForms(["do", "do", "does", "do", "do", "do"], "did", "do"),
  ),
  verb(
    "voir",
    "advanced",
    { en: "to see", fr: "voir" },
    {
      present: ["vois", "vois", "voit", "voyons", "voyez", "voient"],
      past: ["ai vu", "as vu", "a vu", "avons vu", "avez vu", "ont vu"],
      imperfect: ["voyais", "voyais", "voyait", "voyions", "voyiez", "voyaient"],
      futureSimple: ["verrai", "verras", "verra", "verrons", "verrez", "verront"],
    },
    enForms(["see", "see", "sees", "see", "see", "see"], "saw", "see"),
  ),
  verb(
    "vouloir",
    "advanced",
    { en: "to want", fr: "vouloir" },
    {
      present: ["veux", "veux", "veut", "voulons", "voulez", "veulent"],
      past: ["ai voulu", "as voulu", "a voulu", "avons voulu", "avez voulu", "ont voulu"],
      imperfect: ["voulais", "voulais", "voulait", "voulions", "vouliez", "voulaient"],
      futureSimple: ["voudrai", "voudras", "voudra", "voudrons", "voudrez", "voudront"],
    },
    enForms(["want", "want", "wants", "want", "want", "want"], "wanted", "want"),
  ),
  verb(
    "finir",
    "advanced",
    { en: "to finish", fr: "finir" },
    {
      present: ["finis", "finis", "finit", "finissons", "finissez", "finissent"],
      past: ["ai fini", "as fini", "a fini", "avons fini", "avez fini", "ont fini"],
      imperfect: ["finissais", "finissais", "finissait", "finissions", "finissiez", "finissaient"],
      futureSimple: ["finirai", "finiras", "finira", "finirons", "finirez", "finiront"],
    },
    enForms(["finish", "finish", "finishes", "finish", "finish", "finish"], "finished", "finish"),
  ),
];

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
