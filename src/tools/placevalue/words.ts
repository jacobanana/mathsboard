// Place-value helpers: column sets (Ones..Billions + decimals), digit extraction
// and a number-to-words generator. Kept out of index.ts so the tool file stays
// focused on layout/draw, and so the pure functions are unit-testable.

import { clamp } from "@/board/geometry";

// Abbreviated integer-place labels, 10^0 .. 10^9 (Ones .. Billions). Indexed by
// exponent, so INT_ABBR[3] === "Th". Extends the old tool (which stopped at M).
export const INT_ABBR = ["O", "T", "H", "Th", "TTh", "HTh", "M", "TM", "HM", "B"];

// Decimal-place labels, in order after the point: tenths, hundredths, thousandths
// (the exact labels the legacy tool used).
export const DEC_ABBR = ["t", "h", "th"];

// Full names for the slider label ("Up to Thousands"), indexed like INT_ABBR.
export const PLACE_NAMES = [
  "Ones",
  "Tens",
  "Hundreds",
  "Thousands",
  "Ten thousands",
  "Hundred thousands",
  "Millions",
  "Ten millions",
  "Hundred millions",
  "Billions",
];

/**
 * The abbreviated column array for `places` integer columns (1..10, Ones..Billions)
 * and `decimals` decimal columns (0..3). Largest place on the LEFT, Ones on the
 * right, then a "." separator column and the decimal places. e.g.
 * colsFor(4, 0) -> ["Th","H","T","O"]; colsFor(3, 2) -> ["H","T","O",".","t","h"].
 */
export function colsFor(places: number, decimals: number): string[] {
  const p = clamp(Math.round(places), 1, 10);
  const d = clamp(Math.round(decimals), 0, 3);
  const cols: string[] = [];
  for (let e = p - 1; e >= 0; e--) cols.push(INT_ABBR[e]); // largest place left -> Ones
  if (d > 0) {
    cols.push(".");
    for (let j = 0; j < d; j++) cols.push(DEC_ABBR[j]);
  }
  return cols;
}

/**
 * The digit string for `target` across `places` integer + `decimals` decimal
 * columns, zero-padded and left-truncated to exactly places+decimals chars.
 * Float-safe (scales to an integer before stringifying). Integer column k (0 =
 * largest place) is str[k]; decimal column j is str[places + j].
 * e.g. digitStr(304, 4, 0) -> "0304"; digitStr(12.34, 2, 2) -> "1234".
 */
export function digitStr(target: number, places: number, decimals: number): string {
  const total = places + decimals;
  const scaled = Math.round(Math.abs(target) * Math.pow(10, decimals));
  return String(scaled).padStart(total, "0").slice(-total);
}

// --- number to words ------------------------------------------------------

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion"]; // 10^0, 10^3, 10^6, 10^9

/** Words for 0..999 (no scale word). "" for 0 so callers can skip empty chunks. */
function threeToWords(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(ONES[h] + " hundred");
  if (r) {
    if (h) parts.push("and"); // UK "two hundred AND thirty-four"
    if (r < 20) parts.push(ONES[r]);
    else {
      const t = Math.floor(r / 10);
      const o = r % 10;
      parts.push(o ? TENS[t] + "-" + ONES[o] : TENS[t]);
    }
  }
  return parts.join(" ");
}

/** Words for a non-negative integer up to the billions (10 digits). */
function intToWords(k: number): string {
  if (k === 0) return "zero";
  const chunks: number[] = [];
  let n = k;
  while (n > 0) {
    chunks.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (c === 0) continue;
    let cw = threeToWords(c);
    // UK "one thousand AND one" / "two thousand AND twenty": the final <100 group
    // takes an "and" when higher groups precede it (stripped by normalizeWords, so
    // this is purely for a natural-reading prompt).
    if (i === 0 && c < 100 && words.length > 0) cw = "and " + cw;
    words.push(cw + (SCALES[i] ? " " + SCALES[i] : ""));
  }
  return words.join(" ");
}

/**
 * `value` written out in words (UK convention), covering Ones..Billions and, when
 * `decimals` > 0, a "point d d d" tail (each fractional digit spoken separately,
 * e.g. 12.34 -> "twelve point three four"). Negatives get a "negative " prefix
 * (defensive — the Dialog blocks them).
 */
export function toWords(value: number, decimals = 0): string {
  const neg = value < 0;
  const abs = Math.abs(value);
  const factor = Math.pow(10, decimals);
  const scaled = Math.round(abs * factor);
  const intPart = Math.floor(scaled / factor);
  let words = intToWords(intPart);
  if (decimals > 0) {
    const frac = scaled % factor;
    const fracStr = String(frac).padStart(decimals, "0");
    words += " point " + fracStr.split("").map((d) => ONES[Number(d)]).join(" ");
  }
  return (neg ? "negative " : "") + words;
}
