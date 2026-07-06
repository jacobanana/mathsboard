// Pure place-value helpers: column sets, digit extraction, number-to-words, and
// the forgiving word marking used by the "type it in words" mode.

import { describe, expect, it } from "vitest";
import { colsFor, digitStr, toWords, INT_ABBR, DEC_ABBR } from "@/tools/placevalue/words";
import { normalizeWords, wordsMatch } from "@/canvas/drawHelpers";

describe("colsFor", () => {
  it("orders integer places largest-first down to Ones", () => {
    expect(colsFor(4, 0)).toEqual(["Th", "H", "T", "O"]);
    expect(colsFor(1, 0)).toEqual(["O"]);
  });

  it("reaches Billions at the top of the range", () => {
    expect(colsFor(10, 0)).toEqual([...INT_ABBR].reverse());
    expect(colsFor(10, 0)[0]).toBe("B");
    expect(colsFor(10, 0)).toHaveLength(10);
  });

  it("appends a dot separator then the decimal places", () => {
    expect(colsFor(3, 2)).toEqual(["H", "T", "O", ".", ...DEC_ABBR.slice(0, 2)]);
    expect(colsFor(1, 3)).toEqual(["O", ".", "t", "h", "th"]);
  });

  it("clamps out-of-range places and decimals", () => {
    expect(colsFor(0, 0)).toEqual(["O"]);
    expect(colsFor(99, 9)).toHaveLength(10 + 1 + 3);
  });
});

describe("digitStr", () => {
  it("zero-pads to places (largest place first)", () => {
    expect(digitStr(1234, 4, 0)).toBe("1234");
    expect(digitStr(304, 4, 0)).toBe("0304");
    expect(digitStr(7, 3, 0)).toBe("007");
  });

  it("packs integer then decimal digits, float-safely", () => {
    expect(digitStr(12.34, 2, 2)).toBe("1234");
    expect(digitStr(0.5, 1, 1)).toBe("05");
    expect(digitStr(1.005, 1, 3)).toBe("1005");
  });

  it("keeps the low digits if a number overflows the columns", () => {
    expect(digitStr(12345, 3, 0)).toBe("345");
  });
});

describe("toWords", () => {
  it("spells integers up to the billions", () => {
    expect(toWords(0)).toBe("zero");
    expect(toWords(7)).toBe("seven");
    expect(toWords(19)).toBe("nineteen");
    expect(toWords(20)).toBe("twenty");
    expect(toWords(34)).toBe("thirty-four");
    expect(toWords(100)).toBe("one hundred");
    expect(toWords(1234)).toBe("one thousand two hundred and thirty-four");
    expect(toWords(1000000000)).toBe("one billion");
  });

  it("uses UK 'and' for a trailing sub-hundred group", () => {
    expect(toWords(1001)).toBe("one thousand and one");
    expect(toWords(2020)).toBe("two thousand and twenty");
  });

  it("skips empty thousand/million groups", () => {
    expect(toWords(1000000)).toBe("one million");
    expect(toWords(1000234)).toBe("one million two hundred and thirty-four");
  });

  it("reads decimals digit-by-digit after 'point'", () => {
    expect(toWords(12.34, 2)).toBe("twelve point three four");
    expect(toWords(0.5, 1)).toBe("zero point five");
  });
});

describe("wordsMatch / normalizeWords", () => {
  it("ignores case, hyphens, commas and 'and'", () => {
    expect(wordsMatch("one thousand two hundred thirty four", toWords(1234))).toBe(true);
    expect(wordsMatch("One Hundred And One", "one hundred one")).toBe(true);
    expect(wordsMatch("thirty-four", "thirty four")).toBe(true);
    expect(wordsMatch("1,234", "one thousand two hundred and thirty-four")).toBe(false);
  });

  it("keeps 'thousand' intact when stripping 'and'", () => {
    expect(normalizeWords("one thousand")).toBe("one thousand");
  });

  it("treats blank as a non-match", () => {
    expect(wordsMatch("", "zero")).toBe(false);
    expect(wordsMatch("   ", "zero")).toBe(false);
  });
});
