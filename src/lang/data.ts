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
  {
    id: "weather",
    label: "Weather",
    emoji: "🌤️",
    items: [
      { emoji: "☀️", terms: { en: "sun", fr: "soleil" } },
      { emoji: "🌧️", terms: { en: "rain", fr: "pluie" } },
      { emoji: "☁️", terms: { en: "cloud", fr: "nuage" } },
      { emoji: "💨", terms: { en: "wind", fr: "vent" } },
      { emoji: "❄️", terms: { en: "snow", fr: "neige" } },
      { emoji: "⛈️", terms: { en: "storm", fr: "orage" } },
      { emoji: "🥵", terms: { en: "hot", fr: "chaud" } },
      { emoji: "🥶", terms: { en: "cold", fr: "froid" } },
      { emoji: "🌈", terms: { en: "rainbow", fr: "arc-en-ciel" } },
    ],
  },
  {
    id: "body",
    label: "Body parts",
    emoji: "🧍",
    items: [
      { emoji: "👤", terms: { en: "head", fr: "tête" } },
      { emoji: "✋", terms: { en: "hand", fr: "main" } },
      { emoji: "🦶", terms: { en: "foot", fr: "pied" } },
      { emoji: "👁️", terms: { en: "eye", fr: "œil" } },
      { emoji: "👂", terms: { en: "ear", fr: "oreille" } },
      { emoji: "👃", terms: { en: "nose", fr: "nez" } },
      { emoji: "👄", terms: { en: "mouth", fr: "bouche" } },
      { emoji: "💪", terms: { en: "arm", fr: "bras" } },
      { emoji: "🦵", terms: { en: "leg", fr: "jambe" } },
      { emoji: "💇", terms: { en: "hair", fr: "cheveux" } },
    ],
  },
  {
    id: "clothing",
    label: "Clothes",
    emoji: "👕",
    items: [
      { emoji: "👕", terms: { en: "t-shirt", fr: "tee-shirt" } },
      { emoji: "👖", terms: { en: "trousers", fr: "pantalon" } },
      { emoji: "👗", terms: { en: "dress", fr: "robe" } },
      { emoji: "👟", terms: { en: "shoes", fr: "chaussures" } },
      { emoji: "🎩", terms: { en: "hat", fr: "chapeau" } },
      { emoji: "🧥", terms: { en: "coat", fr: "manteau" } },
      { emoji: "🧦", terms: { en: "socks", fr: "chaussettes" } },
      { emoji: "🧤", terms: { en: "gloves", fr: "gants" } },
      { emoji: "🧣", terms: { en: "scarf", fr: "écharpe" } },
    ],
  },
  {
    id: "games",
    label: "Games & play",
    emoji: "🎲",
    items: [
      { emoji: "🎮", terms: { en: "game", fr: "jeu" } },
      { emoji: "🧸", terms: { en: "toy", fr: "jouet" } },
      { emoji: "⚽", terms: { en: "ball", fr: "ballon" } },
      { emoji: "🚲", terms: { en: "bike", fr: "vélo" } },
      { emoji: "🪁", terms: { en: "kite", fr: "cerf-volant" } },
      { emoji: "🧩", terms: { en: "puzzle", fr: "puzzle" } },
      { emoji: "🃏", terms: { en: "cards", fr: "cartes" } },
      { emoji: "🛹", terms: { en: "skateboard", fr: "skateboard" } },
      { emoji: "🪆", terms: { en: "doll", fr: "poupée" } },
    ],
  },
  {
    id: "days",
    label: "Days of the week",
    emoji: "📅",
    items: [
      // Days carry no emoji cue — nothing distinguishes them pictorially — so
      // the flash cards / match game show the words alone (French is lowercase
      // by convention; English keeps its capital).
      { terms: { en: "Monday", fr: "lundi" } },
      { terms: { en: "Tuesday", fr: "mardi" } },
      { terms: { en: "Wednesday", fr: "mercredi" } },
      { terms: { en: "Thursday", fr: "jeudi" } },
      { terms: { en: "Friday", fr: "vendredi" } },
      { terms: { en: "Saturday", fr: "samedi" } },
      { terms: { en: "Sunday", fr: "dimanche" } },
    ],
  },
  {
    id: "house",
    label: "At home",
    emoji: "🏠",
    items: [
      { emoji: "🏠", terms: { en: "house", fr: "maison" } },
      { emoji: "🚪", terms: { en: "door", fr: "porte" } },
      { emoji: "🪟", terms: { en: "window", fr: "fenêtre" } },
      { emoji: "🛏️", terms: { en: "bed", fr: "lit" } },
      { emoji: "🪑", terms: { en: "chair", fr: "chaise" } },
      { emoji: "🏡", terms: { en: "garden", fr: "jardin" } },
      { emoji: "🍳", terms: { en: "kitchen", fr: "cuisine" } },
      { emoji: "🔑", terms: { en: "key", fr: "clé" } },
      { emoji: "💡", terms: { en: "lamp", fr: "lampe" } },
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emoji: "🌳",
    items: [
      { emoji: "🌳", terms: { en: "tree", fr: "arbre" } },
      { emoji: "🌸", terms: { en: "flower", fr: "fleur" } },
      { emoji: "🌙", terms: { en: "moon", fr: "lune" } },
      { emoji: "⭐", terms: { en: "star", fr: "étoile" } },
      { emoji: "🌊", terms: { en: "sea", fr: "mer" } },
      { emoji: "⛰️", terms: { en: "mountain", fr: "montagne" } },
      { emoji: "🍃", terms: { en: "leaf", fr: "feuille" } },
      { emoji: "🪨", terms: { en: "stone", fr: "pierre" } },
      { emoji: "🏞️", terms: { en: "river", fr: "rivière" } },
    ],
  },
  {
    id: "greetings",
    label: "Greetings",
    emoji: "👋",
    items: [
      { emoji: "👋", terms: { en: "hello", fr: "bonjour" } },
      { terms: { en: "goodbye", fr: "au revoir" } },
      { emoji: "✅", terms: { en: "yes", fr: "oui" } },
      { emoji: "❌", terms: { en: "no", fr: "non" } },
      { terms: { en: "please", fr: "s'il te plaît" } },
      { emoji: "🙏", terms: { en: "thank you", fr: "merci" } },
      { terms: { en: "sorry", fr: "pardon" } },
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
