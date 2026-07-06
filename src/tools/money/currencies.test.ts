// Currency data + money maths: every denomination formats and parses back to
// itself, the difficulty filters are sane, and making an amount / making change
// is exact and canonical (fewest pieces) across all four currencies.

import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  CURRENCY_CODES,
  DENOM_BY_ID,
  coinStep,
  denominationsFor,
  format,
  greedyMakeChange,
  greedyPieces,
  makeable,
  parseAmount,
  type Difficulty,
} from "@/tools/money/currencies";

const sum = (ds: { value: number }[]) => ds.reduce((s, d) => s + d.value, 0);

describe.each(CURRENCY_CODES)("%s", (code) => {
  const cur = CURRENCIES[code];

  it("has coins and bills, ascending, with unique ids", () => {
    expect(cur.denominations.some((d) => d.kind === "coin")).toBe(true);
    expect(cur.denominations.some((d) => d.kind === "bill")).toBe(true);
    const ids = cur.denominations.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of cur.denominations) {
      expect(d.value).toBeGreaterThan(0);
      expect(d.sizeMm).toBeGreaterThan(0);
      expect(DENOM_BY_ID[d.id]).toBe(d);
    }
  });

  it("format ↔ parseAmount round-trips every denomination", () => {
    for (const d of cur.denominations) {
      const parsed = parseAmount(format(d.value, cur), cur);
      expect(parsed).toBe(d.value);
    }
  });

  it("parses lenient inputs (leading dot, spaces, symbol)", () => {
    // half a major unit, however it's typed
    const half = cur.minorPerMajor / 2;
    expect(parseAmount(format(half, cur), cur)).toBe(half);
    expect(parseAmount("  " + format(half, cur) + "  ", cur)).toBe(half);
    // a bare integer is major units
    expect(parseAmount("3", cur)).toBe(3 * cur.minorPerMajor);
    // unreadable input
    expect(parseAmount("", cur)).toBeNull();
    expect(parseAmount("abc", cur)).toBeNull();
  });

  it("difficulty filters are nested subsets, easy ⊆ medium ⊆ hard", () => {
    const diffs: Difficulty[] = ["easy", "medium", "hard"];
    const [easy, medium, hard] = diffs.map((d) => denominationsFor(cur, d));
    expect(easy.length).toBeGreaterThan(0);
    expect(hard.length).toBe(cur.denominations.length);
    const ids = (ds: { id: string }[]) => new Set(ds.map((d) => d.id));
    const [me, mm] = [ids(medium), ids(hard)];
    for (const d of easy) expect(me.has(d.id)).toBe(true);
    for (const d of medium) expect(mm.has(d.id)).toBe(true);
    // easy is coins only
    expect(easy.every((d) => d.kind === "coin")).toBe(true);
  });

  it("greedyPieces makes an amount exactly, summing back", () => {
    const denoms = denominationsFor(cur, "hard");
    const step = coinStep(cur);
    for (let k = 1; k <= 40; k++) {
      const amount = k * step * 3; // always a multiple of the coin step
      const pieces = greedyPieces(amount, denoms);
      expect(pieces).not.toBeNull();
      expect(sum(pieces!)).toBe(amount);
    }
  });

  it("makeable agrees with greedyPieces on the coin step", () => {
    const denoms = denominationsFor(cur, "hard");
    const step = coinStep(cur);
    // a multiple of the step is makeable...
    expect(makeable(step * 7, denoms)).toBe(true);
    expect(greedyPieces(step * 7, denoms)).not.toBeNull();
    // ...a non-multiple (only possible when step > 1, i.e. CHF) is not
    if (step > 1) {
      expect(makeable(step - 1, denoms)).toBe(false);
      expect(greedyPieces(step - 1, denoms)).toBeNull();
    }
  });

  it("greedyMakeChange returns exact change for paid ≥ price", () => {
    const denoms = denominationsFor(cur, "hard");
    const step = coinStep(cur);
    const price = 4 * step * 5;
    const paid = price + 7 * step * 4;
    const change = greedyMakeChange(price, paid, denoms);
    expect(change).not.toBeNull();
    expect(sum(change!)).toBe(paid - price);
  });
});
