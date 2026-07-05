// Shared UI constants for the options strip.
//
//   PALETTE     -> pen / text / maths / shape-border colours, [label, hex]
//                  pairs: three neutrals (black, gray, white) then a full 8-hue
//                  rainbow (red → pink).
//   LASER/FILL  -> the SAME colour vocabulary, tuned per use — vivid for the
//                  laser, soft pastels for shape fills.
//   *_SIZE_RANGE-> slider bounds for each brush-like setting. The old S/M/L
//                  presets (pen 3/6/12, text 18/26/40) sit inside these ranges;
//                  ranges + defaults are bundled per SIZE CHANNEL below and
//                  seed the store's `sizes` table.
//
// Palettes are literal hex (not theme tokens), so they stay as literals here.
// ORDER MATTERS: PALETTE[0] is the default ink (= theme.ink, black) and the
// colour-cycle start; FILL_PALETTE[0] is "none"; LASER_PALETTE[0] is the laser
// default (must match canvas/interactions/laser.ts LASER_COLOR).

/** Ink colours (pen / text / maths / shape borders): three neutrals then an
 *  8-hue rainbow, kept at a saturation that stays readable on light paper. */
export const PALETTE: [string, string][] = [
  ["black", "#1C2826"],
  ["gray", "#64726F"],
  ["white", "#FFFFFF"],
  ["red", "#D64545"],
  ["orange", "#E8842B"],
  ["yellow", "#EBC017"],
  ["green", "#2E9E5B"],
  ["teal", "#16A6A0"],
  ["blue", "#2E6FB7"],
  ["purple", "#7E57C2"],
  ["pink", "#D6469B"],
];

/** Vivid, high-visibility colours for the laser pointer (its own palette — the
 *  muted ink PALETTE reads poorly as a "laser"). Same rainbow as PALETTE but
 *  bright; RED STAYS FIRST — it's the default and MUST match the laser's
 *  fallback colour (canvas/interactions/laser.ts LASER_COLOR). */
export const LASER_PALETTE: [string, string][] = [
  ["red", "#ff2b2b"],
  ["orange", "#ff8c1a"],
  ["yellow", "#ffd21a"],
  ["green", "#12d64a"],
  ["teal", "#12d6c2"],
  ["blue", "#2e8bff"],
  ["purple", "#a24bff"],
  ["pink", "#ff2bd0"],
  ["white", "#ffffff"],
  ["gray", "#b8c2c0"],
  ["black", "#202826"],
];

export interface SizeRange {
  min: number;
  max: number;
  step: number;
}

/**
 * Shape BACKGROUND colours: "none" (transparent) first, then the neutrals and
 * soft pastel tints of the rainbow — light enough that ink, labels and the
 * squared paper stay readable through / over a filled shape. Solid black is the
 * one deliberate exception (pair it with the white pen). Same hue order as
 * PALETTE, so a fill swatch lines up with its border counterpart.
 */
export const FILL_PALETTE: [string, string][] = [
  ["no fill", "none"],
  ["black", "#1C2826"],
  ["gray", "#C7CFCE"],
  ["white", "#FFFFFF"],
  ["soft red", "#F2CACA"],
  ["soft orange", "#F7DCC0"],
  ["soft yellow", "#F7E7B8"],
  ["soft green", "#C8E6D3"],
  ["soft teal", "#C2E7E3"],
  ["soft blue", "#C9DCF2"],
  ["soft purple", "#DED3F0"],
  ["soft pink", "#F3CCE5"],
];

export const PEN_SIZE_RANGE: SizeRange = { min: 1, max: 24, step: 1 };
/** Highlighter nib width: wider than the pen (a marker, not a fine liner). */
export const HIGHLIGHTER_SIZE_RANGE: SizeRange = { min: 8, max: 48, step: 2 };
/** Shape border width (also nudged by +/- while a shape mode is active). */
export const SHAPE_WIDTH_RANGE: SizeRange = { min: 1, max: 12, step: 1 };
/** Regular-polygon side count (the draw dock's stepper + the dialog). */
export const POLYGON_SIDES_RANGE: SizeRange = { min: 3, max: 12, step: 1 };
export const TEXT_SIZE_RANGE: SizeRange = { min: 12, max: 64, step: 2 };
/** Maths-notation base size: same band as text (26 = the natural layout size,
 *  i.e. uniform-resize scale 1). */
export const MATH_SIZE_RANGE: SizeRange = { min: 12, max: 64, step: 2 };
export const ERASER_SIZE_RANGE: SizeRange = { min: 12, max: 120, step: 4 };

// --- size channels ----------------------------------------------------------
// Every size-bearing setting is a CHANNEL: one entry here = one default in the
// store's `sizes` table (board/store.ts) + one range. Which channel the active
// tool/mode binds to is decided in board/styling.ts (sizeBinding) — adding a
// sized tool means adding a channel here, not a store field + setter + UI
// branches. (The pen's shape modes share the "pen" channel but clamp it into
// SHAPE_WIDTH_RANGE — the border width follows the pen default.)

export type SizeChannelId = "pen" | "highlighter" | "text" | "math" | "eraser";

export const SIZE_CHANNELS: Record<
  SizeChannelId,
  { range: SizeRange; default: number }
> = {
  pen: { range: PEN_SIZE_RANGE, default: 6 },
  highlighter: { range: HIGHLIGHTER_SIZE_RANGE, default: 20 },
  text: { range: TEXT_SIZE_RANGE, default: 26 },
  math: { range: MATH_SIZE_RANGE, default: 26 },
  eraser: { range: ERASER_SIZE_RANGE, default: 45 },
};

/** A fresh per-channel defaults table (the store's boot value). */
export function defaultSizes(): Record<SizeChannelId, number> {
  return Object.fromEntries(
    Object.entries(SIZE_CHANNELS).map(([id, c]) => [id, c.default]),
  ) as Record<SizeChannelId, number>;
}
