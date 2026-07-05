// Shared UI constants for the options strip.
//
//   PALETTE     -> pen / text colours, [label, hex] pairs.
//   *_SIZE_RANGE-> slider bounds for each brush-like setting. The old S/M/L
//                  presets (pen 3/6/12, text 18/26/40) sit inside these ranges;
//                  defaults live in the store (penSize 6, textSize 26,
//                  eraserSize 45).
//
// PALETTE keeps the literal hex values from the prototype, NOT theme tokens
// (the prototype hard-codes them), so they stay as literals here.

export const PALETTE: [string, string][] = [
  ["black", "#1C2826"],
  ["blue", "#2E6FB7"],
  ["red", "#D64545"],
  ["green", "#2E9E5B"],
  ["orange", "#E8842B"],
];

/** Vivid, high-visibility colours for the laser pointer (its own palette — the
 *  muted ink PALETTE reads poorly as a "laser"). First entry is the default and
 *  MUST match the laser's fallback colour (canvas/interactions/laser.ts). */
export const LASER_PALETTE: [string, string][] = [
  ["red", "#ff2b2b"],
  ["green", "#12d64a"],
  ["blue", "#2e8bff"],
  ["magenta", "#ff2bd0"],
  ["amber", "#ffb020"],
];

export interface SizeRange {
  min: number;
  max: number;
  step: number;
}

/**
 * Shape BACKGROUND colours: "none" (transparent) first, then white and soft
 * pastel tints of the pen palette — light enough that ink, labels and the
 * squared paper stay readable through/over a filled shape.
 */
export const FILL_PALETTE: [string, string][] = [
  ["no fill", "none"],
  ["white", "#FFFFFF"],
  ["soft blue", "#C9DCF2"],
  ["soft red", "#F2CACA"],
  ["soft green", "#C8E6D3"],
  ["soft yellow", "#F7E7B8"],
];

export const PEN_SIZE_RANGE: SizeRange = { min: 1, max: 24, step: 1 };
/** Shape border width (also nudged by +/- while a shape mode is active). */
export const SHAPE_WIDTH_RANGE: SizeRange = { min: 1, max: 12, step: 1 };
/** Regular-polygon side count (the draw dock's stepper + the dialog). */
export const POLYGON_SIDES_RANGE: SizeRange = { min: 3, max: 12, step: 1 };
export const TEXT_SIZE_RANGE: SizeRange = { min: 12, max: 64, step: 2 };
/** Maths-notation base size: same band as text (26 = the natural layout size,
 *  i.e. uniform-resize scale 1). */
export const MATH_SIZE_RANGE: SizeRange = { min: 12, max: 64, step: 2 };
export const ERASER_SIZE_RANGE: SizeRange = { min: 12, max: 120, step: 4 };
