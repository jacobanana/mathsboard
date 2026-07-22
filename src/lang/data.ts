// THE LANGUAGE CONTENT — every word and sentence the widgets draw from, under
// ONE classification system shared by all content, plus the language catalogue.
//
// TWO AXES classify every item — a word OR a sentence:
//   • category — the theme (Animals, Food, Feelings, …), from CATEGORIES.
//   • level    — how hard: "basic" → "medium" → "advanced".
// The dialogs let the learner pick a theme and a level; the resolver (pairs.ts)
// filters by both. The SAME { category, level } tags are on vocab and sentences,
// so the picker feels identical everywhere.
//
// SCALABILITY IS THE POINT. A word is not "the English word and the French
// word": it is a concept whose `terms` map holds ONE entry per language code.
// Adding a language is additive — a new entry in LANGUAGES and a new key in each
// `terms` map — and every widget keeps working because they all resolve content
// through a chosen { known, learning } pair.
//
// The content is aimed at a ~10-year-old who quietly knows more French than they
// let on and mainly needs confidence and motivation: gentle, familiar "basic"
// items to warm up, useful "medium" everyday language, a "advanced" stretch, and
// a whole Confidence theme of encouraging sentences.

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

/** English + French to begin with; append here (and add the matching key to the
 *  `terms` maps below) to grow the set. */
export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
];

export const languageByCode = (code: LangCode): Language | undefined =>
  LANGUAGES.find((l) => l.code === code);

// --- the classification -----------------------------------------------------

/** Difficulty, low → high. */
export type Level = "basic" | "medium" | "advanced";
export const LEVELS: Level[] = ["basic", "medium", "advanced"];
export const LEVEL_LABEL: Record<Level, string> = {
  basic: "Basic",
  medium: "Medium",
  advanced: "Advanced",
};

/** A theme both vocab and sentences can be tagged with. */
export interface Category {
  id: string;
  label: string;
  emoji: string;
}

/** The themes, in the order the pickers show them. */
export const CATEGORIES: Category[] = [
  { id: "greetings", label: "Greetings", emoji: "👋" },
  { id: "confidence", label: "Confidence", emoji: "💪" },
  { id: "feelings", label: "Feelings", emoji: "😊" },
  { id: "numbers", label: "Numbers", emoji: "🔢" },
  { id: "colours", label: "Colours", emoji: "🎨" },
  { id: "animals", label: "Animals", emoji: "🐾" },
  { id: "food", label: "Food & drink", emoji: "🍎" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { id: "body", label: "Body", emoji: "🧍" },
  { id: "clothes", label: "Clothes", emoji: "👕" },
  { id: "school", label: "School", emoji: "🏫" },
  { id: "home", label: "Home", emoji: "🏠" },
  { id: "weather", label: "Weather", emoji: "🌤️" },
  { id: "nature", label: "Nature", emoji: "🌳" },
  { id: "sport", label: "Games & sport", emoji: "⚽" },
  { id: "time", label: "Days & time", emoji: "📅" },
  { id: "actions", label: "Actions", emoji: "🏃" },
  { id: "describing", label: "Describing", emoji: "↔️" },
  { id: "pronouns", label: "Pronouns", emoji: "🧑" },
  { id: "prepositions", label: "Prepositions", emoji: "📍" },
  { id: "questions", label: "Question words", emoji: "❓" },
  { id: "connectors", label: "Linking words", emoji: "🔗" },
];

export const categoryById = (id: string): Category | undefined =>
  CATEGORIES.find((c) => c.id === id);

// --- vocabulary -------------------------------------------------------------

/** One vocabulary concept: its theme, level, an optional picture cue, and its
 *  word in each language. A pair is only usable when BOTH the known and learning
 *  languages have an entry (see pairs.ts). */
export interface VocabItem {
  category: string;
  level: Level;
  emoji?: string;
  terms: Record<LangCode, string>;
}

/** Shorthand builder — keeps the long list below readable. */
const v = (
  category: string,
  level: Level,
  en: string,
  fr: string,
  emoji?: string,
): VocabItem => ({ category, level, emoji, terms: { en, fr } });

export const VOCAB: VocabItem[] = [
  // --- Greetings -----------------------------------------------------------
  v("greetings", "basic", "hello", "bonjour", "👋"),
  v("greetings", "basic", "hi", "salut", "🙋"),
  v("greetings", "basic", "yes", "oui", "✅"),
  v("greetings", "basic", "no", "non", "❌"),
  v("greetings", "basic", "please", "s'il te plaît", "🙏"),
  v("greetings", "basic", "thank you", "merci", "😊"),
  v("greetings", "basic", "goodbye", "au revoir", "👋"),
  v("greetings", "medium", "good morning", "bonjour", "🌅"),
  v("greetings", "medium", "good evening", "bonsoir", "🌆"),
  v("greetings", "medium", "good night", "bonne nuit", "🌙"),
  v("greetings", "medium", "sorry", "pardon"),
  v("greetings", "medium", "excuse me", "excusez-moi"),
  v("greetings", "advanced", "you're welcome", "de rien"),
  v("greetings", "advanced", "see you soon", "à bientôt"),
  v("greetings", "advanced", "welcome", "bienvenue"),

  // --- Confidence (mostly sentences; a few cheer words) --------------------
  v("confidence", "basic", "well done", "bravo", "🎉"),
  v("confidence", "basic", "great", "super", "🌟"),
  v("confidence", "basic", "cool", "génial", "😎"),
  v("confidence", "medium", "brilliant", "excellent", "✨"),
  v("confidence", "medium", "of course", "bien sûr"),
  v("confidence", "advanced", "keep going", "continue", "💪"),
  v("confidence", "advanced", "almost", "presque"),

  // --- Feelings ------------------------------------------------------------
  v("feelings", "basic", "happy", "content", "😀"),
  v("feelings", "basic", "sad", "triste", "😢"),
  v("feelings", "basic", "tired", "fatigué", "😴"),
  v("feelings", "medium", "hungry", "affamé", "🍽️"),
  v("feelings", "medium", "thirsty", "assoiffé", "🥤"),
  v("feelings", "medium", "scared", "effrayé", "😨"),
  v("feelings", "medium", "angry", "fâché", "😠"),
  v("feelings", "advanced", "excited", "excité", "🤩"),
  v("feelings", "advanced", "bored", "ennuyé", "🥱"),
  v("feelings", "advanced", "proud", "fier", "😌"),
  v("feelings", "advanced", "surprised", "surpris", "😲"),

  // --- Numbers -------------------------------------------------------------
  v("numbers", "basic", "one", "un", "1️⃣"),
  v("numbers", "basic", "two", "deux", "2️⃣"),
  v("numbers", "basic", "three", "trois", "3️⃣"),
  v("numbers", "basic", "four", "quatre", "4️⃣"),
  v("numbers", "basic", "five", "cinq", "5️⃣"),
  v("numbers", "basic", "six", "six", "6️⃣"),
  v("numbers", "basic", "seven", "sept", "7️⃣"),
  v("numbers", "basic", "eight", "huit", "8️⃣"),
  v("numbers", "basic", "nine", "neuf", "9️⃣"),
  v("numbers", "basic", "ten", "dix", "🔟"),
  v("numbers", "medium", "eleven", "onze"),
  v("numbers", "medium", "twelve", "douze"),
  v("numbers", "medium", "thirteen", "treize"),
  v("numbers", "medium", "fifteen", "quinze"),
  v("numbers", "medium", "twenty", "vingt"),
  v("numbers", "advanced", "thirty", "trente"),
  v("numbers", "advanced", "fifty", "cinquante"),
  v("numbers", "advanced", "hundred", "cent"),
  v("numbers", "advanced", "thousand", "mille"),

  // --- Colours -------------------------------------------------------------
  v("colours", "basic", "red", "rouge", "🔴"),
  v("colours", "basic", "blue", "bleu", "🔵"),
  v("colours", "basic", "green", "vert", "🟢"),
  v("colours", "basic", "yellow", "jaune", "🟡"),
  v("colours", "basic", "black", "noir", "⚫"),
  v("colours", "basic", "white", "blanc", "⚪"),
  v("colours", "medium", "orange", "orange", "🟠"),
  v("colours", "medium", "purple", "violet", "🟣"),
  v("colours", "medium", "pink", "rose", "🩷"),
  v("colours", "medium", "brown", "marron", "🟤"),
  v("colours", "medium", "grey", "gris"),
  v("colours", "advanced", "gold", "doré"),
  v("colours", "advanced", "silver", "argenté"),

  // --- Animals -------------------------------------------------------------
  v("animals", "basic", "dog", "chien", "🐶"),
  v("animals", "basic", "cat", "chat", "🐱"),
  v("animals", "basic", "bird", "oiseau", "🐦"),
  v("animals", "basic", "fish", "poisson", "🐟"),
  v("animals", "basic", "rabbit", "lapin", "🐰"),
  v("animals", "medium", "horse", "cheval", "🐴"),
  v("animals", "medium", "cow", "vache", "🐮"),
  v("animals", "medium", "pig", "cochon", "🐷"),
  v("animals", "medium", "sheep", "mouton", "🐑"),
  v("animals", "medium", "mouse", "souris", "🐭"),
  v("animals", "advanced", "dolphin", "dauphin", "🐬"),
  v("animals", "advanced", "eagle", "aigle", "🦅"),
  v("animals", "advanced", "snake", "serpent", "🐍"),
  v("animals", "advanced", "wolf", "loup", "🐺"),
  v("animals", "advanced", "fox", "renard", "🦊"),

  // --- Food & drink --------------------------------------------------------
  v("food", "basic", "apple", "pomme", "🍎"),
  v("food", "basic", "bread", "pain", "🍞"),
  v("food", "basic", "water", "eau", "💧"),
  v("food", "basic", "milk", "lait", "🥛"),
  v("food", "medium", "cheese", "fromage", "🧀"),
  v("food", "medium", "egg", "œuf", "🥚"),
  v("food", "medium", "chocolate", "chocolat", "🍫"),
  v("food", "medium", "strawberry", "fraise", "🍓"),
  v("food", "medium", "pear", "poire", "🍏"),
  v("food", "advanced", "vegetable", "légume", "🥕"),
  v("food", "advanced", "meat", "viande", "🍖"),
  v("food", "advanced", "breakfast", "petit-déjeuner", "🥐"),
  v("food", "advanced", "meal", "repas", "🍽️"),

  // --- Family --------------------------------------------------------------
  v("family", "basic", "mother", "mère", "👩"),
  v("family", "basic", "father", "père", "👨"),
  v("family", "basic", "sister", "sœur", "👧"),
  v("family", "basic", "brother", "frère", "👦"),
  v("family", "medium", "grandmother", "grand-mère", "👵"),
  v("family", "medium", "grandfather", "grand-père", "👴"),
  v("family", "medium", "baby", "bébé", "👶"),
  v("family", "medium", "friend", "ami", "👫"),
  v("family", "advanced", "cousin", "cousin"),
  v("family", "advanced", "uncle", "oncle"),
  v("family", "advanced", "aunt", "tante"),
  v("family", "advanced", "parents", "parents"),

  // --- Body ----------------------------------------------------------------
  v("body", "basic", "head", "tête", "🙂"),
  v("body", "basic", "hand", "main", "✋"),
  v("body", "basic", "foot", "pied", "🦶"),
  v("body", "basic", "eye", "œil", "👁️"),
  v("body", "medium", "ear", "oreille", "👂"),
  v("body", "medium", "nose", "nez", "👃"),
  v("body", "medium", "mouth", "bouche", "👄"),
  v("body", "medium", "arm", "bras", "💪"),
  v("body", "medium", "leg", "jambe", "🦵"),
  v("body", "medium", "hair", "cheveux", "💇"),
  v("body", "advanced", "finger", "doigt"),
  v("body", "advanced", "knee", "genou"),
  v("body", "advanced", "tooth", "dent", "🦷"),
  v("body", "advanced", "shoulder", "épaule"),

  // --- Clothes -------------------------------------------------------------
  v("clothes", "basic", "t-shirt", "tee-shirt", "👕"),
  v("clothes", "basic", "trousers", "pantalon", "👖"),
  v("clothes", "basic", "shoes", "chaussures", "👟"),
  v("clothes", "basic", "hat", "chapeau", "🎩"),
  v("clothes", "medium", "dress", "robe", "👗"),
  v("clothes", "medium", "coat", "manteau", "🧥"),
  v("clothes", "medium", "socks", "chaussettes", "🧦"),
  v("clothes", "medium", "gloves", "gants", "🧤"),
  v("clothes", "medium", "scarf", "écharpe", "🧣"),
  v("clothes", "advanced", "jumper", "pull"),
  v("clothes", "advanced", "boots", "bottes", "🥾"),
  v("clothes", "advanced", "jacket", "veste"),

  // --- School --------------------------------------------------------------
  v("school", "basic", "book", "livre", "📕"),
  v("school", "basic", "pencil", "crayon", "✏️"),
  v("school", "basic", "pen", "stylo", "🖊️"),
  v("school", "basic", "bag", "sac", "🎒"),
  v("school", "medium", "notebook", "cahier", "📓"),
  v("school", "medium", "chair", "chaise", "🪑"),
  v("school", "medium", "teacher", "professeur", "🧑‍🏫"),
  v("school", "medium", "school", "école", "🏫"),
  v("school", "advanced", "homework", "devoirs"),
  v("school", "advanced", "lesson", "leçon"),
  v("school", "advanced", "ruler", "règle", "📏"),
  v("school", "advanced", "rubber", "gomme"),

  // --- Home ----------------------------------------------------------------
  v("home", "basic", "house", "maison", "🏠"),
  v("home", "basic", "door", "porte", "🚪"),
  v("home", "basic", "window", "fenêtre", "🪟"),
  v("home", "basic", "bed", "lit", "🛏️"),
  v("home", "medium", "kitchen", "cuisine", "🍳"),
  v("home", "medium", "garden", "jardin", "🏡"),
  v("home", "medium", "key", "clé", "🔑"),
  v("home", "medium", "lamp", "lampe", "💡"),
  v("home", "advanced", "bathroom", "salle de bain", "🛁"),
  v("home", "advanced", "stairs", "escalier"),
  v("home", "advanced", "wall", "mur"),
  v("home", "advanced", "roof", "toit"),

  // --- Weather -------------------------------------------------------------
  v("weather", "basic", "sun", "soleil", "☀️"),
  v("weather", "basic", "rain", "pluie", "🌧️"),
  v("weather", "basic", "cloud", "nuage", "☁️"),
  v("weather", "basic", "wind", "vent", "💨"),
  v("weather", "medium", "snow", "neige", "❄️"),
  v("weather", "medium", "hot", "chaud", "🥵"),
  v("weather", "medium", "cold", "froid", "🥶"),
  v("weather", "advanced", "storm", "orage", "⛈️"),
  v("weather", "advanced", "rainbow", "arc-en-ciel", "🌈"),
  v("weather", "advanced", "fog", "brouillard", "🌫️"),

  // --- Nature --------------------------------------------------------------
  v("nature", "basic", "tree", "arbre", "🌳"),
  v("nature", "basic", "flower", "fleur", "🌸"),
  v("nature", "basic", "moon", "lune", "🌙"),
  v("nature", "basic", "star", "étoile", "⭐"),
  v("nature", "medium", "sea", "mer", "🌊"),
  v("nature", "medium", "mountain", "montagne", "⛰️"),
  v("nature", "medium", "river", "rivière", "🏞️"),
  v("nature", "medium", "leaf", "feuille", "🍃"),
  v("nature", "advanced", "forest", "forêt", "🌲"),
  v("nature", "advanced", "beach", "plage", "🏖️"),
  v("nature", "advanced", "field", "champ"),
  v("nature", "advanced", "stone", "pierre", "🪨"),

  // --- Games & sport -------------------------------------------------------
  v("sport", "basic", "ball", "ballon", "⚽"),
  v("sport", "basic", "game", "jeu", "🎮"),
  v("sport", "basic", "bike", "vélo", "🚲"),
  v("sport", "medium", "toy", "jouet", "🧸"),
  v("sport", "medium", "kite", "cerf-volant", "🪁"),
  v("sport", "medium", "cards", "cartes", "🃏"),
  v("sport", "medium", "swimming", "natation", "🏊"),
  v("sport", "advanced", "football", "football", "⚽"),
  v("sport", "advanced", "running", "course", "🏃"),
  v("sport", "advanced", "team", "équipe"),
  v("sport", "advanced", "winner", "gagnant", "🏆"),

  // --- Days & time ---------------------------------------------------------
  v("time", "basic", "Monday", "lundi"),
  v("time", "basic", "Tuesday", "mardi"),
  v("time", "basic", "Wednesday", "mercredi"),
  v("time", "basic", "Thursday", "jeudi"),
  v("time", "basic", "Friday", "vendredi"),
  v("time", "basic", "Saturday", "samedi"),
  v("time", "basic", "Sunday", "dimanche"),
  v("time", "medium", "today", "aujourd'hui"),
  v("time", "medium", "tomorrow", "demain"),
  v("time", "medium", "yesterday", "hier"),
  v("time", "medium", "morning", "matin", "🌅"),
  v("time", "medium", "night", "nuit", "🌙"),
  v("time", "advanced", "week", "semaine"),
  v("time", "advanced", "month", "mois"),
  v("time", "advanced", "year", "année"),
  v("time", "advanced", "hour", "heure", "⏰"),

  // --- Actions (verbs) -----------------------------------------------------
  v("actions", "basic", "to be", "être"),
  v("actions", "basic", "to have", "avoir"),
  v("actions", "basic", "to go", "aller"),
  v("actions", "basic", "to eat", "manger", "🍽️"),
  v("actions", "basic", "to drink", "boire", "🥤"),
  v("actions", "medium", "to do", "faire"),
  v("actions", "medium", "to speak", "parler", "🗣️"),
  v("actions", "medium", "to see", "voir", "👀"),
  v("actions", "medium", "to like", "aimer", "❤️"),
  v("actions", "medium", "to play", "jouer", "🎲"),
  v("actions", "advanced", "to read", "lire", "📖"),
  v("actions", "advanced", "to write", "écrire", "✍️"),
  v("actions", "advanced", "to sleep", "dormir", "😴"),
  v("actions", "advanced", "to run", "courir", "🏃"),
  v("actions", "advanced", "to learn", "apprendre"),

  // --- Describing (adjectives / opposites) ---------------------------------
  v("describing", "basic", "big", "grand"),
  v("describing", "basic", "small", "petit"),
  v("describing", "basic", "good", "bon"),
  v("describing", "basic", "bad", "mauvais"),
  v("describing", "medium", "new", "nouveau"),
  v("describing", "medium", "old", "vieux"),
  v("describing", "medium", "fast", "rapide"),
  v("describing", "medium", "slow", "lent"),
  v("describing", "medium", "nice", "gentil"),
  v("describing", "advanced", "beautiful", "beau"),
  v("describing", "advanced", "easy", "facile"),
  v("describing", "advanced", "difficult", "difficile"),
  v("describing", "advanced", "funny", "drôle"),

  // --- Pronouns ------------------------------------------------------------
  v("pronouns", "basic", "I", "je"),
  v("pronouns", "basic", "you", "tu"),
  v("pronouns", "basic", "he", "il"),
  v("pronouns", "basic", "she", "elle"),
  v("pronouns", "medium", "we", "nous"),
  v("pronouns", "medium", "you (all)", "vous"),
  v("pronouns", "medium", "they", "ils"),
  v("pronouns", "advanced", "they (girls)", "elles"),

  // --- Prepositions --------------------------------------------------------
  v("prepositions", "basic", "in", "dans"),
  v("prepositions", "basic", "on", "sur"),
  v("prepositions", "basic", "under", "sous"),
  v("prepositions", "basic", "with", "avec"),
  v("prepositions", "medium", "without", "sans"),
  v("prepositions", "medium", "for", "pour"),
  v("prepositions", "medium", "to", "à"),
  v("prepositions", "medium", "of", "de"),
  v("prepositions", "advanced", "in front of", "devant"),
  v("prepositions", "advanced", "behind", "derrière"),
  v("prepositions", "advanced", "between", "entre"),

  // --- Question words ------------------------------------------------------
  v("questions", "basic", "who", "qui"),
  v("questions", "basic", "what", "quoi"),
  v("questions", "basic", "where", "où"),
  v("questions", "medium", "when", "quand"),
  v("questions", "medium", "why", "pourquoi"),
  v("questions", "medium", "how", "comment"),
  v("questions", "advanced", "how many", "combien"),
  v("questions", "advanced", "which", "quel"),

  // --- Linking words -------------------------------------------------------
  v("connectors", "basic", "and", "et"),
  v("connectors", "basic", "or", "ou"),
  v("connectors", "basic", "but", "mais"),
  v("connectors", "medium", "because", "parce que"),
  v("connectors", "medium", "so", "donc"),
  v("connectors", "medium", "if", "si"),
  v("connectors", "advanced", "then", "puis"),
  v("connectors", "advanced", "very", "très"),
  v("connectors", "advanced", "also", "aussi"),
];

// --- sentences --------------------------------------------------------------

/** One sentence, tagged with the SAME { category, level } as vocab. */
export interface SentenceItem {
  category: string;
  level: Level;
  terms: Record<LangCode, string>;
}

const s = (
  category: string,
  level: Level,
  en: string,
  fr: string,
): SentenceItem => ({ category, level, terms: { en, fr } });

export const SENTENCES: SentenceItem[] = [
  // --- Greetings -----------------------------------------------------------
  s("greetings", "basic", "Hello!", "Bonjour !"),
  s("greetings", "basic", "How are you?", "Comment ça va ?"),
  s("greetings", "basic", "I am fine, thank you.", "Ça va bien, merci."),
  s("greetings", "medium", "My name is Alex.", "Je m'appelle Alex."),
  s("greetings", "medium", "What is your name?", "Comment tu t'appelles ?"),
  s("greetings", "medium", "See you tomorrow!", "À demain !"),
  s("greetings", "advanced", "Nice to meet you.", "Enchanté."),
  s("greetings", "advanced", "Have a nice day.", "Bonne journée."),

  // --- Confidence (the motivation set) -------------------------------------
  s("confidence", "basic", "I can do it!", "Je peux le faire !"),
  s("confidence", "basic", "Well done!", "Bravo !"),
  s("confidence", "basic", "I like French.", "J'aime le français."),
  s("confidence", "medium", "I am learning French.", "J'apprends le français."),
  s("confidence", "medium", "I am getting better.", "Je progresse."),
  s("confidence", "medium", "Don't worry!", "Ne t'inquiète pas !"),
  s("confidence", "advanced", "I get better every day.", "Je progresse chaque jour."),
  s("confidence", "advanced", "Mistakes help me learn.", "Les erreurs m'aident à apprendre."),
  s("confidence", "advanced", "You can do it too!", "Tu peux le faire aussi !"),

  // --- Feelings ------------------------------------------------------------
  s("feelings", "basic", "I am happy.", "Je suis content."),
  s("feelings", "basic", "I am tired.", "Je suis fatigué."),
  s("feelings", "medium", "I am hungry.", "J'ai faim."),
  s("feelings", "medium", "I am thirsty.", "J'ai soif."),
  s("feelings", "advanced", "I am a bit nervous.", "Je suis un peu nerveux."),
  s("feelings", "advanced", "I feel great today!", "Je me sens bien aujourd'hui !"),

  // --- Food ----------------------------------------------------------------
  s("food", "basic", "I want some water.", "Je veux de l'eau."),
  s("food", "basic", "I like apples.", "J'aime les pommes."),
  s("food", "medium", "Can I have some bread?", "Je peux avoir du pain ?"),
  s("food", "medium", "I don't like cheese.", "Je n'aime pas le fromage."),
  s("food", "advanced", "What's for dinner?", "Qu'est-ce qu'on mange ?"),
  s("food", "advanced", "This is delicious!", "C'est délicieux !"),

  // --- Animals -------------------------------------------------------------
  s("animals", "basic", "The dog is big.", "Le chien est grand."),
  s("animals", "basic", "I have a cat.", "J'ai un chat."),
  s("animals", "medium", "The cat is black.", "Le chat est noir."),
  s("animals", "advanced", "My favourite animal is the dolphin.", "Mon animal préféré est le dauphin."),

  // --- School --------------------------------------------------------------
  s("school", "basic", "I read a book.", "Je lis un livre."),
  s("school", "basic", "I go to school.", "Je vais à l'école."),
  s("school", "medium", "Where is my pencil?", "Où est mon crayon ?"),
  s("school", "medium", "The teacher is nice.", "Le professeur est gentil."),
  s("school", "advanced", "I don't understand.", "Je ne comprends pas."),
  s("school", "advanced", "Can you help me, please?", "Peux-tu m'aider, s'il te plaît ?"),

  // --- Home / everyday -----------------------------------------------------
  s("home", "basic", "I have a red bag.", "J'ai un sac rouge."),
  s("home", "medium", "The sky is blue.", "Le ciel est bleu."),
  s("home", "medium", "I am ten years old.", "J'ai dix ans."),
  s("home", "advanced", "My favourite colour is blue.", "Ma couleur préférée est le bleu."),
  s("home", "advanced", "I have two brothers.", "J'ai deux frères."),

  // --- Games & sport -------------------------------------------------------
  s("sport", "basic", "I play football.", "Je joue au football."),
  s("sport", "medium", "Let's play together!", "On joue ensemble !"),
  s("sport", "advanced", "Our team won the game!", "Notre équipe a gagné le match !"),

  // --- Weather -------------------------------------------------------------
  s("weather", "basic", "It is sunny.", "Il fait beau."),
  s("weather", "medium", "It is raining.", "Il pleut."),
  s("weather", "advanced", "It is cold today.", "Il fait froid aujourd'hui."),
];
