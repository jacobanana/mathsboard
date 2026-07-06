// Currency data + money maths for the Money tool.
//
// One table (CURRENCIES) describes every coin and note we render: its value in
// the currency's MINOR unit (cents / pence / centimes / rappen), whether it's a
// coin or a bill, the label printed on its face, the real physical size in mm
// (which drives relative on-screen scale — so the US dime really does render
// smaller than the penny), and its colour(s). Bimetallic coins carry a second
// `coreColor` for the inner disc.
//
// The rest of the file is pure money maths: format / parse an amount, list the
// denominations available at a difficulty, test whether an amount can be made,
// and make it (or make change) greedily. All four systems (USD, GBP, EUR, CHF)
// are canonical, so the greedy pick is also the fewest-coins pick.
//
// Colours are the metal (copper / silver / gold-brass / bimetallic) for coins
// and the note's background colour for bills. Sizes and colours are from the
// issuing authorities (US Mint, ECB, Royal Mint / Bank of England, SNB /
// Swissmint); see the tool's plan file for the sourced table.

export type CurrencyCode = "USD" | "GBP" | "EUR" | "CHF";
export type PieceKind = "coin" | "bill";
export type Difficulty = "easy" | "medium" | "hard";

// --- metal / note colour palette -------------------------------------------
const COPPER = "#B87333";
const SILVER = "#C9CBCD";
const GOLD = "#D4AF37"; // outer ring of a bimetallic coin, US golden dollar
const BRASS = "#C6A24E"; // Nordic gold (euro 10/20/50c) & Swiss 5 Rp bronze

export interface Denomination {
  /** Stable id, unique across a currency (kind is in it: $1 exists as both). */
  id: string;
  /** Owning currency. */
  code: CurrencyCode;
  /** Value in the currency's minor unit (1/100 of the major unit). */
  value: number;
  kind: PieceKind;
  /** The label drawn on the face, e.g. "25¢", "£2", "½", "€10". */
  face: string;
  /** Real size in mm: coin diameter, or a note's LONG side. */
  sizeMm: number;
  /** A note's SHORT side in mm (coins omit it). */
  heightMm?: number;
  /** Surface colour: the metal for a coin, the note background for a bill. */
  color: string;
  /** Inner-disc colour for a bimetallic coin (then `color` is the outer ring). */
  coreColor?: string;
}

export interface Currency {
  code: CurrencyCode;
  /** Symbol used when formatting an amount. */
  symbol: string;
  /** Put the symbol after the number (none of ours do; kept for generality). */
  symbolAfter?: boolean;
  /** A space between the symbol and the number (CHF: "CHF 3.75"). */
  symbolSpace?: boolean;
  /** Decimal separator for display and lenient parsing. */
  decimal: "." | ",";
  /** Minor units per major unit (100 for all four). */
  minorPerMajor: number;
  /** Denominations, ascending by value. */
  denominations: Denomination[];
}

// --- the table --------------------------------------------------------------

/** Build the denomination list for one currency (keeps ids/colours tidy). */
function build(
  code: CurrencyCode,
  rows: Array<
    [kind: PieceKind, value: number, face: string, sizeMm: number, color: string, coreColor?: string, heightMm?: number]
  >,
): Denomination[] {
  return rows.map(([kind, value, face, sizeMm, color, coreColor, heightMm]) => ({
    id: `${code}-${kind}-${value}`,
    code,
    value,
    kind,
    face,
    sizeMm,
    color,
    ...(coreColor ? { coreColor } : {}),
    ...(heightMm ? { heightMm } : {}),
  }));
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  USD: {
    code: "USD",
    symbol: "$",
    decimal: ".",
    minorPerMajor: 100,
    denominations: build("USD", [
      ["coin", 1, "1¢", 19.05, COPPER],
      ["coin", 5, "5¢", 21.21, SILVER],
      ["coin", 10, "10¢", 17.91, SILVER],
      ["coin", 25, "25¢", 24.26, SILVER],
      ["coin", 50, "50¢", 30.61, SILVER],
      ["coin", 100, "$1", 26.49, GOLD],
      // US notes are all one size (156 × 66.3 mm); colours are the subtle
      // background tints introduced from 2003 (uscurrency.gov).
      ["bill", 100, "$1", 156, "#C7D6C0", undefined, 66.3],
      ["bill", 200, "$2", 156, "#C7D6C0", undefined, 66.3],
      ["bill", 500, "$5", 156, "#B7A9C0", undefined, 66.3],
      ["bill", 1000, "$10", 156, "#E7B36A", undefined, 66.3],
      ["bill", 2000, "$20", 156, "#9DBE8E", undefined, 66.3],
      ["bill", 5000, "$50", 156, "#C79AA0", undefined, 66.3],
      ["bill", 10000, "$100", 156, "#9FC6C9", undefined, 66.3],
    ]),
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    decimal: ".",
    minorPerMajor: 100,
    denominations: build("GBP", [
      ["coin", 1, "1p", 20.3, COPPER],
      ["coin", 2, "2p", 25.9, COPPER],
      ["coin", 5, "5p", 18.0, SILVER],
      ["coin", 10, "10p", 24.5, SILVER],
      ["coin", 20, "20p", 21.4, SILVER],
      ["coin", 50, "50p", 27.3, SILVER],
      ["coin", 100, "£1", 23.43, GOLD, SILVER], // 12-sided bimetallic
      ["coin", 200, "£2", 28.4, GOLD, SILVER], // gold ring, silver centre
      // Polymer notes (Bank of England): back-foil / dominant colour.
      ["bill", 500, "£5", 125, "#4FA79B", undefined, 65],
      ["bill", 1000, "£10", 132, "#C57A3C", undefined, 69],
      ["bill", 2000, "£20", 139, "#7E6BA6", undefined, 73],
      ["bill", 5000, "£50", 146, "#C0504D", undefined, 77],
    ]),
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    decimal: ",",
    minorPerMajor: 100,
    denominations: build("EUR", [
      ["coin", 1, "1", 16.25, COPPER],
      ["coin", 2, "2", 18.75, COPPER],
      ["coin", 5, "5", 21.25, COPPER],
      ["coin", 10, "10", 19.75, BRASS],
      ["coin", 20, "20", 22.25, BRASS],
      ["coin", 50, "50", 24.25, BRASS],
      ["coin", 100, "€1", 23.25, SILVER, GOLD], // silver ring, gold centre
      ["coin", 200, "€2", 25.75, GOLD, SILVER], // gold ring, silver centre
      ["bill", 500, "€5", 120, "#B7B3AC", undefined, 62],
      ["bill", 1000, "€10", 127, "#C65B6E", undefined, 67],
      ["bill", 2000, "€20", 133, "#4E7FBF", undefined, 72],
      ["bill", 5000, "€50", 140, "#E08A3C", undefined, 77],
      ["bill", 10000, "€100", 147, "#5BA85A", undefined, 82],
      ["bill", 20000, "€200", 153, "#C9A24B", undefined, 82],
      ["bill", 50000, "€500", 160, "#8C6BB1", undefined, 82],
    ]),
  },
  CHF: {
    code: "CHF",
    symbol: "CHF",
    symbolSpace: true,
    decimal: ".",
    minorPerMajor: 100,
    denominations: build("CHF", [
      ["coin", 5, "5", 17.15, BRASS], // 5 Rp aluminium bronze (golden)
      ["coin", 10, "10", 19.15, SILVER],
      ["coin", 20, "20", 21.05, SILVER],
      ["coin", 50, "½", 18.2, SILVER], // ½ franc
      ["coin", 100, "1", 23.2, SILVER],
      ["coin", 200, "2", 27.4, SILVER],
      ["coin", 500, "5", 31.45, SILVER],
      // 9th-series notes; no 500 note. Width is a constant 70 mm.
      ["bill", 1000, "10", 123, "#E8C13A", undefined, 70],
      ["bill", 2000, "20", 130, "#C85450", undefined, 70],
      ["bill", 5000, "50", 137, "#6FA85B", undefined, 70],
      ["bill", 10000, "100", 144, "#4E7FB0", undefined, 70],
      ["bill", 20000, "200", 151, "#B07A45", undefined, 70],
      ["bill", 100000, "1000", 158, "#8C6BA8", undefined, 70],
    ]),
  },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Every denomination, keyed by its id — for turning a stored `pc:` piece back
 *  into a Denomination without scanning. */
export const DENOM_BY_ID: Record<string, Denomination> = Object.fromEntries(
  CURRENCY_CODES.flatMap((c) => CURRENCIES[c].denominations.map((d) => [d.id, d])),
);

export const getCurrency = (code: CurrencyCode): Currency => CURRENCIES[code];
export const getDenom = (id: string): Denomination | undefined => DENOM_BY_ID[id];

// --- formatting -------------------------------------------------------------

/** Format a minor-unit amount for display, e.g. 375 -> "$3.75" (USD),
 *  "€3,75" (EUR), "CHF 3.75" (CHF). Always two decimal places. */
export function format(minor: number, cur: Currency): string {
  const neg = minor < 0;
  const a = Math.abs(Math.round(minor));
  const major = Math.floor(a / cur.minorPerMajor);
  const cents = a % cur.minorPerMajor;
  const num = `${major}${cur.decimal}${String(cents).padStart(2, "0")}`;
  const body = cur.symbolAfter
    ? `${num}${cur.symbolSpace ? " " : ""}${cur.symbol}`
    : `${cur.symbol}${cur.symbolSpace ? " " : ""}${num}`;
  return (neg ? "−" : "") + body;
}

/**
 * Parse a typed amount into minor units (or null if unreadable). Lenient:
 * strips the symbol / letters / spaces, accepts "." or "," as the decimal
 * point, tolerates a leading decimal (".75"), and treats a bare integer as
 * MAJOR units ("3" -> 300). Returns null for empty / non-numeric input.
 */
export function parseAmount(text: string, cur: Currency): number | null {
  const raw = text.trim();
  if (!raw) return null;
  const neg = /^[-−]/.test(raw);
  const s = raw.replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const majorStr = (lastSep === -1 ? s : s.slice(0, lastSep)).replace(/[.,]/g, "");
  const fracStr = (lastSep === -1 ? "" : s.slice(lastSep + 1)).replace(/[.,]/g, "");
  if (majorStr === "" && fracStr === "") return null;
  const major = majorStr === "" ? 0 : parseInt(majorStr, 10);
  const cents =
    fracStr === "" ? 0 : parseInt((fracStr + "00").slice(0, 2), 10);
  if (Number.isNaN(major) || Number.isNaN(cents)) return null;
  const minor = major * cur.minorPerMajor + cents;
  return neg ? -minor : minor;
}

// --- denominations by difficulty -------------------------------------------

/**
 * The denominations available at a difficulty, ascending by value:
 *   easy   — coins up to one major unit (pure sub-"dollar" coin counting)
 *   medium — every coin plus small notes (up to 20 major units)
 *   hard   — everything
 */
export function denominationsFor(cur: Currency, diff: Difficulty): Denomination[] {
  const cap = 20 * cur.minorPerMajor;
  return cur.denominations.filter((d) => {
    if (diff === "hard") return true;
    if (diff === "easy") return d.kind === "coin" && d.value <= cur.minorPerMajor;
    return d.kind === "coin" || d.value <= cap; // medium
  });
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Smallest common step of the coin denominations (5 for CHF, 1 otherwise): any
 *  amount that isn't a multiple of it can't be made exactly. */
export function coinStep(cur: Currency): number {
  return cur.denominations
    .filter((d) => d.kind === "coin")
    .map((d) => d.value)
    .reduce((a, b) => gcd(a, b));
}

/** Can `minor` be made exactly from the given denominations? With a 1-unit coin
 *  present (or a 5 that tiles, as in CHF) this reduces to a divisibility test. */
export function makeable(minor: number, denoms: Denomination[]): boolean {
  if (minor < 0) return false;
  if (minor === 0) return true;
  const step = denoms.map((d) => d.value).reduce((a, b) => gcd(a, b), 0);
  return step > 0 && minor % step === 0;
}

/**
 * Make `minor` from `denoms` greedily, largest first — the fewest-piece way for
 * all four (canonical) systems. Returns the pieces largest-first, or null if it
 * can't be made exactly with what's allowed.
 */
export function greedyPieces(
  minor: number,
  denoms: Denomination[],
): Denomination[] | null {
  if (minor < 0) return null;
  const desc = [...denoms].sort((a, b) => b.value - a.value);
  const out: Denomination[] = [];
  let rem = minor;
  for (const d of desc) {
    while (rem >= d.value) {
      out.push(d);
      rem -= d.value;
    }
  }
  return rem === 0 ? out : null;
}

/** The change owed (paid − price) as pieces, greedily. */
export function greedyMakeChange(
  price: number,
  paid: number,
  denoms: Denomination[],
): Denomination[] | null {
  return greedyPieces(paid - price, denoms);
}
