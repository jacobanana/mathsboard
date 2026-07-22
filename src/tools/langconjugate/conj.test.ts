// The conjugation-game engine: the table + bank derive correctly, cells resolve
// through the bank (pick) or as typed strings (type), correctness and patches
// behave.

import { describe, expect, it } from "vitest";
import {
  allFilled,
  checkPatch,
  clearCellPatch,
  correctCount,
  coverPatch,
  deriveTable,
  flashPairs,
  isChecked,
  isCovered,
  newRoundPatch,
  placePatch,
  resetSessionPatch,
  rowAnswer,
  rowCorrect,
  typePatch,
  usedSlots,
  type ConjObj,
} from "@/tools/langconjugate/conj";

const obj = (over: Partial<ConjObj> = {}): ConjObj => ({
  id: "c-1",
  known: "en",
  learning: "fr",
  verb: "etre",
  tense: "present",
  mode: "pick",
  ...over,
});

describe("deriveTable", () => {
  it("builds 6 rows and a bank that is a permutation of the forms", () => {
    const t = deriveTable(obj());
    expect(t.rows).toHaveLength(6);
    expect(t.infinitiveLearning).toBe("être");
    expect(t.infinitiveKnown).toBe("to be");
    expect([...t.bank].sort()).toEqual([...t.rows.map((r) => r.form)].sort());
  });

  it("is deterministic and reshuffles the bank on a new round", () => {
    expect(deriveTable(obj({ round: 1 })).bank).toEqual(deriveTable(obj({ round: 1 })).bank);
    // (with distinct être forms the bank order differs between rounds)
    expect(deriveTable(obj({ round: 0 })).bank).not.toEqual(deriveTable(obj({ round: 5 })).bank);
  });
});

describe("pick mode", () => {
  it("resolves a placed bank slot to its form and checks correctness", () => {
    const t = deriveTable(obj());
    // Place, into each row, the bank slot holding that row's correct form.
    const patch: Record<string, unknown> = {};
    t.rows.forEach((r, i) => {
      const slot = t.bank.indexOf(r.form);
      patch[`cf:${i}`] = slot;
    });
    const o = obj({ ...patch });
    expect(allFilled(t, o)).toBe(true);
    expect(rowAnswer(t, o, 0)).toBe(t.rows[0].form);
    expect(rowCorrect(t, o, 0)).toBe(true);
    expect(correctCount(t, o)).toBe(6);
    expect(usedSlots(o).size).toBe(6);
  });

  it("a wrong slot is marked incorrect; clear removes it", () => {
    const t = deriveTable(obj());
    // row 0 gets the slot for row 1's form (wrong, forms distinct for être).
    const slot = t.bank.indexOf(t.rows[1].form);
    const o = obj({ ...placePatch(0, slot) });
    expect(rowCorrect(t, o, 0)).toBe(false);
    expect(clearCellPatch(0)).toEqual({ "cf:0": undefined });
  });
});

describe("type mode", () => {
  it("stores typed strings and checks leniently by accent-folding", () => {
    const o = obj({ mode: "type", ...typePatch(0, "SUIS") });
    const t = deriveTable(o);
    expect(rowAnswer(t, o, 0)).toBe("SUIS");
    expect(rowCorrect(t, o, 0)).toBe(true); // normalize → "suis"
  });
});

describe("learn mode + patches", () => {
  it("cover toggles a row", () => {
    const o = obj({ mode: "learn", ...coverPatch(2, true) });
    expect(isCovered(o, 2)).toBe(true);
    expect(isCovered(o, 0)).toBe(false);
  });

  it("checkPatch marks the table; newRound bumps + clears; reset keeps verb", () => {
    expect(isChecked(obj({ ...checkPatch() }))).toBe(true);
    const o = obj({ round: 1, ...placePatch(0, 0), ...checkPatch() });
    const nr = newRoundPatch(o);
    expect(nr.round).toBe(2);
    expect(nr["cf:0"]).toBeUndefined();
    expect(nr.cx).toBeUndefined();
    expect(resetSessionPatch(o)).not.toHaveProperty("round");
  });
});

describe("flashPairs", () => {
  it("makes 'pronoun — infinitive' → written form cards", () => {
    const t = deriveTable(obj());
    const pairs = flashPairs(t);
    expect(pairs).toHaveLength(6);
    expect(pairs[0].known).toBe("je — être");
    expect(pairs[0].learning).toBe("je suis");
  });
});
