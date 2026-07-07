// The hourglass — a flat 2D vector silhouette + the sand surface levels.
//
// Everything is authored in a 100×100 viewBox (VIEW) so the SVG scales crisply
// with the widget. The glass is a single pinched path (two soft-curved bulbs
// meeting at a thin neck); the sand is drawn as full-width bands clipped to that
// path, positioned by the surface-level helpers below. No physics — the level is
// a linear function of the elapsed fraction f ∈ [0,1].

/** Square viewBox side. */
export const VIEW = 100;
/** Glass rim / neck / centre heights. */
export const TOP_RIM_Y = 15;
export const BOT_RIM_Y = 85;
export const NECK_Y = 50;
/** Glass rim half-width (x of the rims) and the pinched neck gap. */
export const RIM_X0 = 20;
export const RIM_X1 = 80;
export const NECK_X0 = 46.5;
export const NECK_X1 = 53.5;

/** The glass outline: top rim → soft-curved right side to the neck → down to the
 *  bottom rim → bottom rim → soft-curved left side back up. Concave (pinched)
 *  sides read as a real hourglass; stroke-linejoin:round softens the tips. */
export const GLASS_PATH =
  `M ${RIM_X0} ${TOP_RIM_Y} ` +
  `L ${RIM_X1} ${TOP_RIM_Y} ` +
  `Q 72 30 ${NECK_X1} ${NECK_Y} ` +
  `Q 72 70 ${RIM_X1} ${BOT_RIM_Y} ` +
  `L ${RIM_X0} ${BOT_RIM_Y} ` +
  `Q 28 70 ${NECK_X0} ${NECK_Y} ` +
  `Q 28 30 ${RIM_X0} ${TOP_RIM_Y} Z`;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Top-bulb sand surface Y as f runs 0→1: full to the rim (TOP_RIM_Y) at f=0,
 *  drained to the neck (NECK_Y) at f=1. Sand sits between this and the neck. */
export function sandTopSurfaceY(f: number): number {
  return TOP_RIM_Y + (NECK_Y - TOP_RIM_Y) * clamp01(f);
}

/** Bottom-bulb sand surface Y: empty at the floor (BOT_RIM_Y) at f=0, heaped to
 *  the neck (NECK_Y) at f=1. Sand sits between this and the floor. */
export function sandBottomSurfaceY(f: number): number {
  return BOT_RIM_Y - (BOT_RIM_Y - NECK_Y) * clamp01(f);
}
