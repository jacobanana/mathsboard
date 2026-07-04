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

export interface SizeRange {
  min: number;
  max: number;
  step: number;
}

export const PEN_SIZE_RANGE: SizeRange = { min: 1, max: 24, step: 1 };
export const TEXT_SIZE_RANGE: SizeRange = { min: 12, max: 64, step: 2 };
/** Maths-notation base size: same band as text (26 = the natural layout size,
 *  i.e. uniform-resize scale 1). */
export const MATH_SIZE_RANGE: SizeRange = { min: 12, max: 64, step: 2 };
export const ERASER_SIZE_RANGE: SizeRange = { min: 12, max: 120, step: 4 };
