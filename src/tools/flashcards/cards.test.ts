// The flash-cards engine: decks are deterministic from the seed, every card is
// internally consistent (a op b === ans) and stays within its level's ranges,
// division is exact and subtraction never goes negative, and the session
// patches move / reset the run as expected.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MIN_COUNT,
  MODES,
  LEVELS,
  ansField,
  cardText,
  clampCount,
  deckTitle,
  deriveDeck,
  flipPatch,
  isCorrect,
  newDeckPatch,
  nextPatch,
  pruneAnswers,
  readAnswer,
  replayPatch,
  resetSessionPatch,
  scoreCount,
  scoreDeck,
  verdict,
  type FlashCard,
  type FlashObj,
} from "@/tools/flashcards/cards";

const obj = (over: Partial<FlashObj> = {}): FlashObj => ({
  id: "fc-1",
  mode: "times",
  level: "easy",
  count: 10,
  table: 0,
  ...over,
});

/** a op b really equals ans. */
function consistent(c: FlashCard): boolean {
  switch (c.op) {
    case "+":
      return c.a + c.b === c.ans;
    case "−":
      return c.a - c.b === c.ans;
    case "×":
      return c.a * c.b === c.ans;
    case "÷":
      return c.b !== 0 && c.a / c.b === c.ans;
  }
}

describe("deriveDeck", () => {
  it("is deterministic — same object derives the identical deck", () => {
    const a = deriveDeck(obj({ mode: "mixed", level: "hard", round: 3 }));
    const b = deriveDeck(obj({ mode: "mixed", level: "hard", round: 3 }));
    expect(a).toEqual(b);
  });

  it("bumping round reshuffles the deck", () => {
    const a = deriveDeck(obj({ mode: "add", round: 0 }));
    const b = deriveDeck(obj({ mode: "add", round: 1 }));
    expect(a).not.toEqual(b);
  });

  it("produces exactly `count` cards (clamped)", () => {
    expect(deriveDeck(obj({ count: 7 }))).toHaveLength(7);
    expect(deriveDeck(obj({ count: 999 }))).toHaveLength(MAX_COUNT);
    expect(deriveDeck(obj({ count: 1 }))).toHaveLength(MIN_COUNT);
  });

  it("every card of every mode/level is internally consistent", () => {
    for (const mode of MODES) {
      for (const level of LEVELS) {
        const deck = deriveDeck(obj({ mode, level, count: MAX_COUNT, round: 5 }));
        deck.forEach((c) => expect(consistent(c), `${mode}/${level}: ${cardText(c)}`).toBe(true));
      }
    }
  });

  it("subtraction never goes negative", () => {
    for (const level of LEVELS) {
      const deck = deriveDeck(obj({ mode: "sub", level, count: MAX_COUNT, round: 2 }));
      deck.forEach((c) => {
        expect(c.op).toBe("−");
        expect(c.ans).toBeGreaterThanOrEqual(0);
        expect(c.b).toBeLessThanOrEqual(c.a);
      });
    }
  });

  it("division is exact with whole quotients", () => {
    for (const level of LEVELS) {
      const deck = deriveDeck(obj({ mode: "div", level, count: MAX_COUNT, round: 4 }));
      deck.forEach((c) => {
        expect(c.op).toBe("÷");
        expect(Number.isInteger(c.ans)).toBe(true);
        expect(c.b * c.ans).toBe(c.a);
      });
    }
  });

  it("a fixed table only asks that table; mixed uses several", () => {
    const fixed = deriveDeck(obj({ mode: "times", table: 7, count: MAX_COUNT }));
    fixed.forEach((c) => expect(c.b).toBe(7));

    const mixed = deriveDeck(obj({ mode: "times", table: 0, count: MAX_COUNT, level: "hard" }));
    const tables = new Set(mixed.map((c) => c.b));
    expect(tables.size).toBeGreaterThan(1);
  });

  it("mixed mode covers more than one operator", () => {
    const deck = deriveDeck(obj({ mode: "mixed", level: "hard", count: MAX_COUNT }));
    const ops = new Set(deck.map((c) => c.op));
    expect(ops.size).toBeGreaterThan(1);
  });

  it("harder levels reach larger numbers than easy", () => {
    const easyMax = Math.max(
      ...deriveDeck(obj({ mode: "add", level: "easy", count: MAX_COUNT })).map((c) => c.ans),
    );
    const hardMax = Math.max(
      ...deriveDeck(obj({ mode: "add", level: "hard", count: MAX_COUNT })).map((c) => c.ans),
    );
    expect(hardMax).toBeGreaterThan(easyMax);
  });
});

describe("answers + scoring", () => {
  it("reads a stored answer by index, blank when absent", () => {
    const o = obj({ [ansField(2)]: "42" });
    expect(readAnswer(o, 2)).toBe("42");
    expect(readAnswer(o, 0)).toBe("");
  });

  it("isCorrect matches the answer and rejects blanks", () => {
    const c: FlashCard = { a: 6, op: "×", b: 7, ans: 42 };
    expect(isCorrect(c, "42")).toBe(true);
    expect(isCorrect(c, " 42 ")).toBe(true);
    expect(isCorrect(c, "41")).toBe(false);
    expect(isCorrect(c, "")).toBe(false);
  });

  it("scoreDeck marks each card and scoreCount tallies the right ones", () => {
    const deck = deriveDeck(obj({ mode: "add", count: 5, round: 1 }));
    const answered: FlashObj = obj({ mode: "add", count: 5, round: 1 });
    // Answer the first three correctly, the fourth wrong, leave the fifth blank.
    answered[ansField(0)] = String(deck[0].ans);
    answered[ansField(1)] = String(deck[1].ans);
    answered[ansField(2)] = String(deck[2].ans);
    answered[ansField(3)] = String(deck[3].ans + 1);
    const scored = scoreDeck(answered, deck);
    expect(scored.map((s) => s.correct)).toEqual([true, true, true, false, false]);
    expect(scoreCount(scored)).toBe(3);
  });

  it("pruneAnswers clears every fa: field only", () => {
    const o = obj({ [ansField(0)]: "1", [ansField(4)]: "9", round: 2 });
    const patch = pruneAnswers(o);
    expect(patch).toEqual({ [ansField(0)]: undefined, [ansField(4)]: undefined });
  });
});

describe("session patches", () => {
  it("flip turns the card over", () => {
    expect(flipPatch()).toEqual({ flipped: true });
  });

  it("next advances the index and shows the front", () => {
    expect(nextPatch(obj({ idx: 2 }))).toEqual({ idx: 3, flipped: false });
    expect(nextPatch(obj({}))).toEqual({ idx: 1, flipped: false });
  });

  it("replay restarts the same deck and clears answers", () => {
    const o = obj({ idx: 9, flipped: true, round: 4, [ansField(0)]: "x" });
    expect(replayPatch(o)).toEqual({ idx: 0, flipped: false, [ansField(0)]: undefined });
  });

  it("new deck bumps round, restarts and clears answers", () => {
    const o = obj({ idx: 9, flipped: true, round: 4, [ansField(1)]: "y" });
    expect(newDeckPatch(o)).toEqual({
      round: 5,
      idx: 0,
      flipped: false,
      [ansField(1)]: undefined,
    });
  });

  it("resetSession restarts the run without touching round", () => {
    const o = obj({ idx: 5, flipped: true, round: 2, [ansField(3)]: "z" });
    const patch = resetSessionPatch(o);
    expect(patch).toEqual({ idx: 0, flipped: false, [ansField(3)]: undefined });
    expect(patch).not.toHaveProperty("round");
  });
});

describe("misc", () => {
  it("clampCount bounds and defaults", () => {
    expect(clampCount(undefined)).toBe(DEFAULT_COUNT);
    expect(clampCount(1)).toBe(MIN_COUNT);
    expect(clampCount(1000)).toBe(MAX_COUNT);
    expect(clampCount(12)).toBe(12);
  });

  it("deckTitle names the table when fixed", () => {
    expect(deckTitle(obj({ mode: "times", table: 8, level: "medium" }))).toContain("8×");
    expect(deckTitle(obj({ mode: "add", level: "hard" }))).toContain("Addition");
  });

  it("verdict scales with the score", () => {
    expect(verdict(10, 10).text).toBe("Brilliant!");
    expect(verdict(8, 10).text).toBe("Great work!");
    expect(verdict(5, 10).text).toBe("Good effort");
    expect(verdict(1, 10).text).toBe("Keep practising");
    expect(verdict(0, 0).text).toBe("Keep practising");
  });
});
