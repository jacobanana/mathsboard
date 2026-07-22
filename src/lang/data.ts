// THE LANGUAGE CONTENT — the words and sentences every language widget draws
// from, plus the catalogue of supported languages.
//
// SCALABILITY IS THE POINT. A word is not "the English word and the French
// word": it is a concept (with an emoji) whose `terms` map holds ONE entry per
// language code. Adding a language is therefore additive — a new entry in
// LANGUAGES and a new key in each `terms`/sentence map — and every widget keeps
// working because they all resolve content through a chosen { known, learning }
// pair (see pairs.ts) rather than hard-coding English↔French anywhere.
//
// We ship English + French first (the beginner, ~10-year-old use case), but the
// shape is deliberately open so Spanish, German, … slot in without touching a
// single widget.

/** A supported language, identified by its ISO 639-1 code. */
export type LangCode = string;

export interface Language {
  code: LangCode;
  /** Name in English, for menus shown in a neutral UI. */
  name: string;
  /** The language's own name for itself ("Français"), shown alongside. */
  nativeName: string;
  /** A flag emoji, purely decorative. */
  flag: string;
}

/**
 * The languages on offer. English and French to begin with; append here (and
 * add the matching key to the `terms` maps below) to grow the set.
 */
export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
];

export const languageByCode = (code: LangCode): Language | undefined =>
  LANGUAGES.find((l) => l.code === code);

// --- vocabulary -------------------------------------------------------------

/** One vocabulary concept: an optional emoji plus its word in each language. */
export interface VocabItem {
  /** A picture cue for the flash cards / match game (helps young learners). */
  emoji?: string;
  /** The word keyed by language code. A pair is only usable when BOTH the
   *  known and learning languages have an entry (see pairs.ts). */
  terms: Record<LangCode, string>;
}

/** A themed set of vocabulary (Colours, Animals, …). */
export interface VocabTopic {
  id: string;
  label: string;
  emoji: string;
  items: VocabItem[];
}

export const TOPICS: VocabTopic[] = [
  {
    id: "numbers",
    label: "Numbers",
    emoji: "🔢",
    items: [
      { emoji: "1️⃣", terms: { en: "one", fr: "un" } },
      { emoji: "2️⃣", terms: { en: "two", fr: "deux" } },
      { emoji: "3️⃣", terms: { en: "three", fr: "trois" } },
      { emoji: "4️⃣", terms: { en: "four", fr: "quatre" } },
      { emoji: "5️⃣", terms: { en: "five", fr: "cinq" } },
      { emoji: "6️⃣", terms: { en: "six", fr: "six" } },
      { emoji: "7️⃣", terms: { en: "seven", fr: "sept" } },
      { emoji: "8️⃣", terms: { en: "eight", fr: "huit" } },
      { emoji: "9️⃣", terms: { en: "nine", fr: "neuf" } },
      { emoji: "🔟", terms: { en: "ten", fr: "dix" } },
    ],
  },
  {
    id: "colours",
    label: "Colours",
    emoji: "🎨",
    items: [
      { emoji: "🔴", terms: { en: "red", fr: "rouge" } },
      { emoji: "🔵", terms: { en: "blue", fr: "bleu" } },
      { emoji: "🟢", terms: { en: "green", fr: "vert" } },
      { emoji: "🟡", terms: { en: "yellow", fr: "jaune" } },
      { emoji: "🟠", terms: { en: "orange", fr: "orange" } },
      { emoji: "🟣", terms: { en: "purple", fr: "violet" } },
      { emoji: "⚫", terms: { en: "black", fr: "noir" } },
      { emoji: "⚪", terms: { en: "white", fr: "blanc" } },
      { emoji: "🟤", terms: { en: "brown", fr: "marron" } },
      { emoji: "🩷", terms: { en: "pink", fr: "rose" } },
    ],
  },
  {
    id: "animals",
    label: "Animals",
    emoji: "🐾",
    items: [
      { emoji: "🐶", terms: { en: "dog", fr: "chien" } },
      { emoji: "🐱", terms: { en: "cat", fr: "chat" } },
      { emoji: "🐴", terms: { en: "horse", fr: "cheval" } },
      { emoji: "🐦", terms: { en: "bird", fr: "oiseau" } },
      { emoji: "🐟", terms: { en: "fish", fr: "poisson" } },
      { emoji: "🐰", terms: { en: "rabbit", fr: "lapin" } },
      { emoji: "🐮", terms: { en: "cow", fr: "vache" } },
      { emoji: "🐷", terms: { en: "pig", fr: "cochon" } },
      { emoji: "🐑", terms: { en: "sheep", fr: "mouton" } },
      { emoji: "🐭", terms: { en: "mouse", fr: "souris" } },
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    emoji: "🍎",
    items: [
      { emoji: "🍎", terms: { en: "apple", fr: "pomme" } },
      { emoji: "🍞", terms: { en: "bread", fr: "pain" } },
      { emoji: "🧀", terms: { en: "cheese", fr: "fromage" } },
      { emoji: "🥛", terms: { en: "milk", fr: "lait" } },
      { emoji: "💧", terms: { en: "water", fr: "eau" } },
      { emoji: "🍏", terms: { en: "pear", fr: "poire" } },
      { emoji: "🥚", terms: { en: "egg", fr: "œuf" } },
      { emoji: "🍫", terms: { en: "chocolate", fr: "chocolat" } },
      { emoji: "🍓", terms: { en: "strawberry", fr: "fraise" } },
      { emoji: "🍊", terms: { en: "orange", fr: "orange" } },
    ],
  },
  {
    id: "family",
    label: "Family",
    emoji: "👨‍👩‍👧",
    items: [
      { emoji: "👩", terms: { en: "mother", fr: "mère" } },
      { emoji: "👨", terms: { en: "father", fr: "père" } },
      { emoji: "👧", terms: { en: "sister", fr: "sœur" } },
      { emoji: "👦", terms: { en: "brother", fr: "frère" } },
      { emoji: "👵", terms: { en: "grandmother", fr: "grand-mère" } },
      { emoji: "👴", terms: { en: "grandfather", fr: "grand-père" } },
      { emoji: "👶", terms: { en: "baby", fr: "bébé" } },
      { emoji: "👫", terms: { en: "friend", fr: "ami" } },
    ],
  },
  {
    id: "classroom",
    label: "Classroom",
    emoji: "🏫",
    items: [
      { emoji: "📕", terms: { en: "book", fr: "livre" } },
      { emoji: "✏️", terms: { en: "pencil", fr: "crayon" } },
      { emoji: "🖊️", terms: { en: "pen", fr: "stylo" } },
      { emoji: "📓", terms: { en: "notebook", fr: "cahier" } },
      { emoji: "🎒", terms: { en: "bag", fr: "sac" } },
      { emoji: "🪑", terms: { en: "chair", fr: "chaise" } },
      { emoji: "🧑‍🏫", terms: { en: "teacher", fr: "professeur" } },
      { emoji: "🏫", terms: { en: "school", fr: "école" } },
    ],
  },
];

export const topicById = (id: string): VocabTopic | undefined =>
  TOPICS.find((t) => t.id === id);

// --- sentences --------------------------------------------------------------

/** One sentence, keyed by language code — the model powering both the
 *  "sentences to learn" phrasebook and the word-order builder. */
export interface SentenceItem {
  terms: Record<LangCode, string>;
}

export interface SentenceSet {
  id: string;
  label: string;
  emoji: string;
  items: SentenceItem[];
}

export const SENTENCE_SETS: SentenceSet[] = [
  {
    id: "greetings",
    label: "Saying hello",
    emoji: "👋",
    items: [
      { terms: { en: "Hello, how are you?", fr: "Bonjour, comment ça va ?" } },
      { terms: { en: "My name is Alex.", fr: "Je m'appelle Alex." } },
      { terms: { en: "I am fine, thank you.", fr: "Je vais bien, merci." } },
      { terms: { en: "What is your name?", fr: "Comment tu t'appelles ?" } },
      { terms: { en: "See you tomorrow!", fr: "À demain !" } },
      { terms: { en: "Have a nice day.", fr: "Bonne journée." } },
    ],
  },
  {
    id: "everyday",
    label: "Every day",
    emoji: "🌤️",
    items: [
      { terms: { en: "The cat is black.", fr: "Le chat est noir." } },
      { terms: { en: "I like chocolate.", fr: "J'aime le chocolat." } },
      { terms: { en: "The dog is big.", fr: "Le chien est grand." } },
      { terms: { en: "I have a red bag.", fr: "J'ai un sac rouge." } },
      { terms: { en: "The sky is blue.", fr: "Le ciel est bleu." } },
      { terms: { en: "I am ten years old.", fr: "J'ai dix ans." } },
    ],
  },
  {
    id: "school",
    label: "At school",
    emoji: "🏫",
    items: [
      { terms: { en: "I read a book.", fr: "Je lis un livre." } },
      { terms: { en: "Where is my pencil?", fr: "Où est mon crayon ?" } },
      { terms: { en: "The teacher is nice.", fr: "Le professeur est gentil." } },
      { terms: { en: "I go to school.", fr: "Je vais à l'école." } },
      { terms: { en: "Can you help me?", fr: "Peux-tu m'aider ?" } },
      { terms: { en: "I don't understand.", fr: "Je ne comprends pas." } },
    ],
  },
];

export const sentenceSetById = (id: string): SentenceSet | undefined =>
  SENTENCE_SETS.find((s) => s.id === id);
