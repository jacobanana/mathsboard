// RESOLVING CONTENT FOR A LANGUAGE PAIR.
//
// Every widget works in terms of a { known, learning } pair — the language the
// learner already speaks and the one they are learning — never English↔French
// directly. These helpers turn the raw catalogue (data.ts) into the concrete
// { known, learning } strings a widget shows, dropping any concept that is
// missing a word in either language so a half-translated entry never surfaces.
// That is also what makes the app scale: add a language to data.ts and every
// widget can pair it with any other, with no widget changes.

import {
  LANGUAGES,
  SENTENCE_SETS,
  TOPICS,
  languageByCode,
  sentenceSetById,
  topicById,
  type LangCode,
} from "@/lang/data";

/** The learner's languages: what they know, and what they're learning. */
export interface LangPair {
  known: LangCode;
  learning: LangCode;
}

/** A vocabulary item resolved for a pair — both words guaranteed present. */
export interface VocabPair {
  known: string;
  learning: string;
  emoji?: string;
}

/** A sentence resolved for a pair — both translations guaranteed present. */
export interface SentencePairText {
  known: string;
  learning: string;
}

/** The default pair when nothing is stored yet: learn the second language using
 *  the first (English → French out of the box). Falls back gracefully if the
 *  catalogue somehow has fewer than two languages. */
export function defaultPair(): LangPair {
  const known = LANGUAGES[0]?.code ?? "en";
  const learning = LANGUAGES[1]?.code ?? LANGUAGES[0]?.code ?? "fr";
  return { known, learning };
}

/** True when both codes exist and differ — a usable learning pair. */
export function isValidPair(p: LangPair): boolean {
  return (
    p.known !== p.learning &&
    languageByCode(p.known) != null &&
    languageByCode(p.learning) != null
  );
}

/** A short human label for a pair, e.g. "English → French". */
export function pairLabel(p: LangPair): string {
  const k = languageByCode(p.known)?.name ?? p.known;
  const l = languageByCode(p.learning)?.name ?? p.learning;
  return `${k} → ${l}`;
}

/** Every vocab item of a topic that has BOTH the known and learning words. */
export function vocabForTopic(topicId: string, pair: LangPair): VocabPair[] {
  const topic = topicById(topicId);
  if (!topic) return [];
  const out: VocabPair[] = [];
  for (const item of topic.items) {
    const known = item.terms[pair.known];
    const learning = item.terms[pair.learning];
    if (known && learning) out.push({ known, learning, emoji: item.emoji });
  }
  return out;
}

/** Every sentence of a set that has BOTH translations. */
export function sentencesForSet(
  setId: string,
  pair: LangPair,
): SentencePairText[] {
  const set = sentenceSetById(setId);
  if (!set) return [];
  const out: SentencePairText[] = [];
  for (const item of set.items) {
    const known = item.terms[pair.known];
    const learning = item.terms[pair.learning];
    if (known && learning) out.push({ known, learning });
  }
  return out;
}

/** Topics that have at least `min` usable pairs for this language pair — so the
 *  dialogs never offer a topic that would come up empty. */
export function usableTopics(pair: LangPair, min = 2): typeof TOPICS {
  return TOPICS.filter((t) => vocabForTopic(t.id, pair).length >= min);
}

/** Sentence sets with at least `min` usable sentences for this pair. */
export function usableSentenceSets(pair: LangPair, min = 1): typeof SENTENCE_SETS {
  return SENTENCE_SETS.filter((s) => sentencesForSet(s.id, pair).length >= min);
}
