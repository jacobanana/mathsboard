// The conjugation-game engine — pure, deterministic, no React.
//
// A widget teaches ONE verb in ONE tense: the six persons (je, tu, il, nous,
// vous, ils). Three ways to work, chosen in the dialog:
//   • learn — the whole table is shown; tap a row to cover it and test yourself.
//   • pick  — the forms are hidden and offered as a scrambled BANK to place into
//             the right rows (an easy, matching-style fill-in).
//   • type  — type each form.
// The table comes from lang/conjugation.ts; the response (placed/typed forms,
// covered rows, whether it's been checked) is live widget-state, undo-invisible,
// synced and persisted — like every other language widget.

import { rngFromSeed, shuffle } from "@/lang/rng";
import {
  conjugationFor,
  displayLine,
  infinitiveOf,
  subjectOf,
  tenseById,
  verbById,
  type ConjRow,
} from "@/lang/conjugation";

export type ConjMode = "learn" | "pick" | "type";

/** The shape the component reads: params plus live widget-state. */
export interface ConjObj {
  id: string;
  known: string;
  learning: string;
  verb: string;
  tense: string;
  mode: ConjMode;
  // --- live widget state ---
  round?: number; // reshuffles the bank / clears the quiz
  [field: string]: unknown;
  // cf:<i>  -> pick: a bank slot index; type: the typed string
  // ch:<i>  -> learn: 1 when the row is covered
  // cx      -> 1 when a quiz table has been checked
}

/** A resolved table for the widget's verb + tense in the learning language. */
export interface ConjTable {
  infinitiveLearning: string;
  infinitiveKnown: string;
  tenseLabel: string;
  /** Each row: its pronoun, the elided SUBJECT as written before the form
   *  ("j'" before a vowel in French), the form, and the full written line. */
  rows: { pronoun: string; subject: string; form: string; display: string }[];
  /** pick mode: the forms in a scrambled order (indices are "bank slots"). */
  bank: string[];
}

const rowsFor = (obj: ConjObj): ConjRow[] =>
  conjugationFor(obj.verb, obj.tense, obj.learning);

/** Build the table (rows + scrambled bank) deterministically from state. */
export function deriveTable(obj: ConjObj): ConjTable {
  const verb = verbById(obj.verb);
  const rows = rowsFor(obj);
  const round = obj.round ?? 0;
  const rng = rngFromSeed(`${obj.id}:${round}:${obj.verb}:${obj.tense}:${obj.learning}`);
  let bank = shuffle(rng, rows.map((r) => r.form));
  // Reshuffle a couple of times if the bank landed in row order.
  for (let t = 0; t < 4 && rows.length > 1 && bank.every((f, i) => f === rows[i].form); t++) {
    bank = shuffle(rng, bank);
  }
  return {
    infinitiveLearning: verb ? infinitiveOf(verb, obj.learning) : obj.verb,
    infinitiveKnown: verb ? infinitiveOf(verb, obj.known) : "",
    tenseLabel: tenseById(obj.tense)?.label ?? "",
    rows: rows.map((r) => ({
      ...r,
      subject: subjectOf(r, obj.learning),
      display: displayLine(r, obj.learning),
    })),
    bank,
  };
}

export const tableSize = (obj: ConjObj): number => rowsFor(obj).length;

export function title(obj: ConjObj): string {
  const verb = verbById(obj.verb);
  return verb ? infinitiveOf(verb, obj.learning) : "Conjugation";
}

// --- comparison -------------------------------------------------------------

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// --- cells (the learner's live state) ---------------------------------------

export const CELL_PREFIX = "cf:";
export const COVER_PREFIX = "ch:";
export const CHECK_FIELD = "cx";
export const cellField = (i: number): string => CELL_PREFIX + i;
export const coverField = (i: number): string => COVER_PREFIX + i;

/** The raw stored cell: a bank-slot index (pick) or the typed string (type). */
export const readCell = (obj: ConjObj, i: number): number | string | undefined => {
  const v = obj[cellField(i)];
  return typeof v === "number" || typeof v === "string" ? v : undefined;
};

/** The answer STRING shown in row `i` — resolved through the bank in pick mode. */
export function rowAnswer(table: ConjTable, obj: ConjObj, i: number): string {
  const v = readCell(obj, i);
  if (obj.mode === "pick") return typeof v === "number" ? table.bank[v] ?? "" : "";
  return typeof v === "string" ? v : "";
}

/** Bank slots already placed into some row (pick mode). */
export function usedSlots(obj: ConjObj): Set<number> {
  const used = new Set<number>();
  for (const k of Object.keys(obj)) {
    if (k.startsWith(CELL_PREFIX) && typeof obj[k] === "number") used.add(obj[k] as number);
  }
  return used;
}

export const isCovered = (obj: ConjObj, i: number): boolean =>
  obj[coverField(i)] === 1 || obj[coverField(i)] === true;

export const isChecked = (obj: ConjObj): boolean => obj[CHECK_FIELD] === 1 || obj[CHECK_FIELD] === true;

export const rowCorrect = (table: ConjTable, obj: ConjObj, i: number): boolean =>
  normalize(rowAnswer(table, obj, i)) === normalize(table.rows[i].form);

export function correctCount(table: ConjTable, obj: ConjObj): number {
  let n = 0;
  for (let i = 0; i < table.rows.length; i++) if (rowCorrect(table, obj, i)) n++;
  return n;
}

/** Every row has an answer placed/typed (ready to check). */
export function allFilled(table: ConjTable, obj: ConjObj): boolean {
  for (let i = 0; i < table.rows.length; i++) {
    if (rowAnswer(table, obj, i) === "") return false;
  }
  return table.rows.length > 0;
}

// --- patches ----------------------------------------------------------------

export const placePatch = (i: number, slot: number): Record<string, unknown> => ({ [cellField(i)]: slot });
export const typePatch = (i: number, v: string): Record<string, unknown> => ({
  [cellField(i)]: v === "" ? undefined : v,
});
export const clearCellPatch = (i: number): Record<string, unknown> => ({ [cellField(i)]: undefined });
export const checkPatch = (): Record<string, unknown> => ({ [CHECK_FIELD]: 1 });
export const coverPatch = (i: number, on: boolean): Record<string, unknown> => ({
  [coverField(i)]: on ? 1 : undefined,
});
export function coverAllPatch(size: number, on: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (let i = 0; i < size; i++) patch[coverField(i)] = on ? 1 : undefined;
  return patch;
}

export function pruneResponses(obj: ConjObj): Record<string, undefined> {
  const patch: Record<string, undefined> = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith(CELL_PREFIX) || k.startsWith(COVER_PREFIX) || k === CHECK_FIELD) {
      patch[k] = undefined;
    }
  }
  return patch;
}

/** New round: reshuffle the bank / clear the quiz. */
export const newRoundPatch = (obj: ConjObj): Record<string, unknown> => ({
  round: (obj.round ?? 0) + 1,
  ...pruneResponses(obj),
});

/** Reset after a settings edit (verb / tense / mode changed). */
export const resetSessionPatch = (obj: ConjObj): Record<string, unknown> => pruneResponses(obj);

// --- flash-cards hand-off ---------------------------------------------------

/** Custom flash-card pairs for this conjugation: front "je — être", back the
 *  written form "je suis". Fed to the existing flash-cards widget. */
export function flashPairs(table: ConjTable): { known: string; learning: string }[] {
  return table.rows.map((r) => ({
    known: `${r.pronoun} — ${table.infinitiveLearning}`,
    learning: r.display,
  }));
}
