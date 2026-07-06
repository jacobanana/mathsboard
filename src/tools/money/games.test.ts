// The game engine: problems are deterministic from the seed, every generated
// amount is exactly makeable in its currency, presented piles total what they
// claim, and each game's checkAnswer marks a correct response right and a wrong
// one wrong.

import { describe, expect, it } from "vitest";
import {
  coinStep,
  denominationsFor,
  getCurrency,
  getDenom,
  greedyPieces,
  makeable,
  parseAmount,
  format,
  CURRENCY_CODES,
  type CurrencyCode,
  type Difficulty,
} from "@/tools/money/currencies";
import {
  GAMES,
  GAME_META,
  checkAnswer,
  deriveProblem,
  liveSum,
  placeField,
  prunePlacedPatch,
  readPlacedPieces,
  problemStamp,
  type MoneyObj,
  type PlacedPiece,
} from "@/tools/money/games";

const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

const obj = (over: Partial<MoneyObj>): MoneyObj => ({
  id: "obj-1",
  currency: "USD",
  game: "count",
  difficulty: "easy",
  ...over,
});

/** Turn a problem's presented pieces into placed `pc:` fields (as the component
 *  would) so we can exercise the build/shop scoring. */
function placeAll(pieces: PlacedPiece[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  pieces.forEach((p, i) =>
    (patch[placeField("p" + i)] = { d: p.denomId, x: p.x, y: p.y, s: p.spin }),
  );
  return patch;
}

describe("determinism", () => {
  it("re-derives the identical problem from the same seed", () => {
    const o = obj({ game: "count", round: 3 });
    expect(deriveProblem(o)).toEqual(deriveProblem({ ...o }));
  });

  it("a different round gives a different problem", () => {
    const a = deriveProblem(obj({ game: "count", round: 1 }));
    const b = deriveProblem(obj({ game: "count", round: 2 }));
    // Same shape but (almost surely) a different pile / total.
    expect(a.target === b.target && a.presented.length === b.presented.length).toBe(false);
  });
});

describe.each(CURRENCY_CODES)("%s", (code: CurrencyCode) => {
  const cur = getCurrency(code);
  const step = coinStep(cur);

  describe.each(DIFFS)("%s", (difficulty) => {
    for (let round = 0; round < 8; round++) {
      it(`count: presented pile totals target and is exactly makeable (round ${round})`, () => {
        const p = deriveProblem(obj({ currency: code, difficulty, game: "count", round }));
        const total = p.presented.reduce((s, x) => s + (getDenom(x.denomId)!.value), 0);
        expect(total).toBe(p.target);
        expect(p.target % step).toBe(0);
        expect(makeable(p.target, denominationsFor(cur, difficulty))).toBe(true);
      });

      it(`make: target is makeable from the tray (round ${round})`, () => {
        const p = deriveProblem(obj({ currency: code, difficulty, game: "make", round }));
        const denoms = denominationsFor(cur, difficulty);
        expect(p.target).toBeGreaterThan(0);
        expect(greedyPieces(p.target, denoms)).not.toBeNull();
      });

      it(`change: 0 < change owed, and is makeable (round ${round})`, () => {
        const p = deriveProblem(obj({ currency: code, difficulty, game: "change", round }));
        expect(p.paid! - p.price!).toBe(p.target);
        expect(p.target).toBeGreaterThan(0);
        expect(makeable(p.target, denominationsFor(cur, difficulty))).toBe(true);
      });

      it(`compare: relation matches the pile totals (round ${round})`, () => {
        const p = deriveProblem(obj({ currency: code, difficulty, game: "compare", round }));
        const ta = liveSum(p.presented);
        const tb = liveSum(p.presentedB ?? []);
        const rel = ta > tb ? ">" : ta < tb ? "<" : "=";
        expect(p.relation).toBe(rel);
      });
    }
  });
});

describe("checkAnswer", () => {
  it("count: correct typed total is ok, wrong is no", () => {
    const o = obj({ game: "count", round: 5 });
    const p = deriveProblem(o);
    const good = { ...o, ans: format(p.target, getCurrency(o.currency)) };
    const bad = { ...o, ans: format(p.target + coinStep(getCurrency(o.currency)), getCurrency(o.currency)) };
    expect(checkAnswer(good, p)).toBe("ok");
    expect(checkAnswer(bad, p)).toBe("no");
    // sanity: the format we fed parses back to the target
    expect(parseAmount(good.ans!, getCurrency(o.currency))).toBe(p.target);
  });

  it("make: placing the exact pieces marks ok", () => {
    const o = obj({ game: "make", difficulty: "medium", round: 2 });
    const p = deriveProblem(o);
    const denoms = denominationsFor(getCurrency(o.currency), o.difficulty);
    const pieces = greedyPieces(p.target, denoms)!.map((d, i) => ({
      key: "p" + i,
      denomId: d.id,
      x: 0.5,
      y: 0.5,
      spin: 0,
    }));
    const withPile = { ...o, ...placeAll(pieces) };
    expect(liveSum(readPlacedPieces(withPile))).toBe(p.target);
    expect(checkAnswer(withPile, p)).toBe("ok");
    expect(checkAnswer(o, p)).toBe("no"); // empty pile
  });

  it("compare: choosing the true relation is ok", () => {
    const o = obj({ game: "compare", difficulty: "medium", round: 4 });
    const p = deriveProblem(o);
    expect(checkAnswer({ ...o, choice: p.relation }, p)).toBe("ok");
    const wrong = p.relation === "=" ? ">" : "=";
    expect(checkAnswer({ ...o, choice: wrong }, p)).toBe("no");
  });
});

describe("placed-piece fields", () => {
  it("round-trips pc:* fields and prunes them", () => {
    const o = obj({
      game: "sandbox",
      [placeField("x1")]: { d: "USD-coin-25", x: 0.2, y: 0.3, s: 0.1 },
      [placeField("x2")]: { d: "USD-coin-10", x: 0.6, y: 0.5, s: -0.1 },
    });
    const pieces = readPlacedPieces(o);
    expect(pieces.length).toBe(2);
    expect(liveSum(pieces)).toBe(35);
    const patch = prunePlacedPatch(o);
    expect(Object.keys(patch).sort()).toEqual([placeField("x1"), placeField("x2")].sort());
    expect(Object.values(patch).every((v) => v === undefined)).toBe(true);
  });
});

describe("metadata", () => {
  it("every game has meta and a valid input mode", () => {
    for (const g of GAMES) {
      expect(GAME_META[g]).toBeTruthy();
      expect(["amount", "build", "choice", "none"]).toContain(GAME_META[g].inputMode);
    }
  });
  it("problemStamp changes with config", () => {
    expect(problemStamp(obj({ game: "make" }))).not.toBe(problemStamp(obj({ game: "count" })));
  });
});
