// Seeded RNG helpers for the language widgets.
//
// The maths widgets (Money mat, dice, flash cards, number-order) each carry a
// private copy of this exact mulberry32 + FNV-1a hash trick so their content is
// DERIVED deterministically from a string seed — every collaborator computes the
// same deck with zero write races, and there is no Date/Math.random anywhere.
// The language widgets share ONE copy here instead of re-deriving it per tool.

/** FNV-1a hash of a string to a 32-bit seed. */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A PRNG seeded straight from a string (the common case). */
export const rngFromSeed = (seed: string): (() => number) =>
  mulberry32(hashStr(seed));

export const randInt = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

/** Fisher–Yates shuffle on a COPY, driven by the seeded rng. */
export function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
