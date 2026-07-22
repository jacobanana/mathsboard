// A ready-to-use prompt the content-creation page offers for copy/download.
// Paste it into any capable LLM, name the language you want, and it returns a
// content pack that imports straight into the Language Board. Kept here (not
// inline in the component) so it is easy to read, tweak and reuse.
//
// The prompt embeds the essential rules a pack must follow so the model doesn't
// have to be handed the full JSON Schema to get it right — though the page
// offers that schema as a download too, for stricter validation.

export const LLM_PROMPT = `You are helping build content for the Language Board, a whiteboard app that teaches languages to children (~8–11 years old). Produce ONE self-contained JSON "content pack" that I can import into the app.

## What I want
Language to teach: <FILL IN, e.g. Spanish>
Language the learner already knows: English (code "en")

Generate rich, age-appropriate content: vocabulary, sentences, and verb conjugations. Aim for breadth across everyday themes and all three difficulty levels.

## Output rules
- Output ONLY the JSON — no prose, no markdown fences.
- "formatVersion": 1
- "id": a short kebab-case id, e.g. "spanish-starter".
- "languages": include EVERY language used, each with { code (ISO 639-1), name (in English), nativeName, flag (emoji) }. Include English so pairs resolve.
- "categories": the themes items are grouped under, each { id (kebab-case), label, emoji }. Reuse these ids so content lines up with the built-in themes: greetings, confidence, feelings, numbers, colours, animals, food, family, body, clothes, school, home, weather, nature, sport, time, actions, describing, pronouns, prepositions, questions, connectors. You may add new themes too.
- Every vocab and sentence item has: "category" (an id from categories), "level" ("basic" | "medium" | "advanced"), and "terms": a map of languageCode → word/sentence. ALWAYS include BOTH the taught language AND English in terms — an item is only usable when both sides are present. "emoji" is optional on vocab.
- "pronouns": for each language that has verbs, six subject pronouns in order [I, you, he/she, we, you-plural, they]. For English use ["I","you","he","we","you","they"].
- "verbs": each has "id" (kebab-case), "level", "infinitive" (map languageCode → infinitive, e.g. {"en":"to be","es":"ser"}), and "forms": a map languageCode → { "present":[6], "past":[6], "imperfect":[6], "futureSimple":[6] }. Each tense array has EXACTLY 6 forms, in the same pronoun order as above. Give the six English forms too (e.g. present ["am","are","is","are","are","are"]). Store only these four tenses — the app derives the near future itself.

## Suggested size
- ~120+ vocab items spread across the themes and levels
- ~30+ sentences
- ~8–10 common verbs

## Example shape (abbreviated)
{
  "formatVersion": 1,
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

Now generate the full pack for the language I named above.`;
