// Coin & note geometry for the Money tool — a thin layer over the dice engine.
//
// A coin is a short cylinder (two discs joined by a ring of rim quads); a note
// is a thin box. Both are built as a generic Mesh whose faces carry exactly what
// the software painter needs: an outward normal, a centroid, and an in-plane
// (u, v) basis so the printed label tumbles with the piece — the same face shape
// the dice painter consumes. All vector / quaternion maths (including the
// `rollQuat` tumble used for the drop animation) is imported from the dice
// geometry; nothing here re-derives it.
//
// Pieces are modelled at unit scale (coin radius 1; a note's LONG side 1) and
// scaled to their real millimetre size at draw time, so denominations keep their
// true relative sizes. A piece rests tilted just enough to show a sliver of its
// edge (like the die's presentation tilt), with an optional in-plane spin so a
// scattered pile looks natural.

import {
  add,
  cross,
  dot,
  mul,
  normalize,
  qFromAxisAngle,
  qMul,
  sub,
  type Quat,
  type Vec3,
} from "@/tools/dice/geometry";

export type FaceKind = "top" | "bottom" | "rim" | "side";

export interface Face {
  /** Vertex indices, CCW seen from outside. */
  indices: number[];
  /** Outward unit normal. */
  normal: Vec3;
  /** Face centroid. */
  center: Vec3;
  /** In-plane basis: u across, v up (used to print the label in-plane). */
  u: Vec3;
  v: Vec3;
  kind: FaceKind;
  /** For the printed face: centre-to-edge room for the label (unit space). */
  inradius?: number;
}

export interface Mesh {
  vertices: Vec3[];
  faces: Face[];
  /** Index of the face that carries the printed design (the coin's top disc /
   *  the note's front). */
  topFace: number;
}

// --- rest orientation -------------------------------------------------------

// Tip the piece toward the viewer (mostly about screen-X, a touch of −Y) so it
// reads as a solid object on a table while its face stays clear — same idea and
// axis as the die's presentation tilt.
const TILT_AXIS: Vec3 = normalize([1, -0.32, 0]);
/** Coins tilt more (~24°) so the rim reads as depth; a flat disc looks 2D. */
const COIN_TILT = 0.42;
/** Notes tilt less (~12°): they're thin, a big tilt just hides the design. */
const BILL_TILT = 0.2;

/** Resting orientation for a piece, with an optional in-plane spin (radians)
 *  about its own face normal so a pile of pieces doesn't look stamped. */
export function pieceQuat(kind: PieceGeomKind, spin = 0): Quat {
  const tilt = qFromAxisAngle(TILT_AXIS, kind === "coin" ? COIN_TILT : BILL_TILT);
  return spin ? qMul(tilt, qFromAxisAngle([0, 0, 1], spin)) : tilt;
}

export type PieceGeomKind = "coin" | "bill";

// --- small maths (private; primitives come from the dice engine) ------------

function centroid(pts: Vec3[]): Vec3 {
  const c = pts.reduce<Vec3>((s, p) => add(s, p), [0, 0, 0]);
  return mul(c, 1 / pts.length);
}

/** Newell's method polygon normal (robust for near-planar quads). */
function polyNormal(pts: Vec3[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize(n);
}

/** Face with an explicit normal + u axis (used where the label must read
 *  axis-aligned — the discs and the note front). v completes a right-handed
 *  frame. */
function framedFace(
  verts: Vec3[],
  indices: number[],
  normal: Vec3,
  u: Vec3,
  kind: FaceKind,
  inradius?: number,
): Face {
  const center = centroid(indices.map((i) => verts[i]));
  return { indices, normal, center, u, v: cross(normal, u), kind, inradius };
}

/** Face whose normal is derived from the vertices and oriented to agree with
 *  `dir` (used for the rim quads / note sides, where u direction is cosmetic). */
function derivedFace(
  verts: Vec3[],
  idx: number[],
  dir: Vec3,
  kind: FaceKind,
): Face {
  const ordered = [...idx];
  let normal = polyNormal(ordered.map((i) => verts[i]));
  if (dot(normal, dir) < 0) {
    ordered.reverse();
    normal = mul(normal, -1);
  }
  const center = centroid(ordered.map((i) => verts[i]));
  const e = normalize(sub(verts[ordered[1]], verts[ordered[0]]));
  const u = normalize(sub(e, mul(normal, dot(e, normal))));
  return { indices: ordered, normal, center, u, v: cross(normal, u), kind };
}

// --- coin (short cylinder) --------------------------------------------------

/**
 * A coin: unit-radius discs at z = ±thickness/2 joined by `segments` rim quads.
 * The top disc (normal +Z) carries the design. `inradius` on the top face is a
 * hair under the radius so the label sits inside the milled rim.
 */
export function makeCoin(segments = 48, thickness = 0.14): Mesh {
  const t = thickness / 2;
  const verts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    verts.push([Math.cos(a), Math.sin(a), t]); // top ring  0..n-1
  }
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    verts.push([Math.cos(a), Math.sin(a), -t]); // bottom ring n..2n-1
  }
  const topRing = Array.from({ length: segments }, (_, i) => i);
  const botRing = Array.from({ length: segments }, (_, i) => segments + i);

  const faces: Face[] = [];
  // Top disc: CCW seen from +Z; label axes u=+X, v=+Y.
  faces.push(framedFace(verts, topRing, [0, 0, 1], [1, 0, 0], "top", 0.86));
  // Bottom disc: reversed so it winds CCW seen from −Z.
  faces.push(
    framedFace(verts, [...botRing].reverse(), [0, 0, -1], [1, 0, 0], "bottom"),
  );
  // Rim quads.
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const quad = [topRing[i], topRing[j], botRing[j], botRing[i]];
    const dir = normalize([verts[topRing[i]][0], verts[topRing[i]][1], 0]);
    faces.push(derivedFace(verts, quad, dir, "rim"));
  }
  return { vertices: verts, faces, topFace: 0 };
}

// --- note (thin box) --------------------------------------------------------

/**
 * A note: a thin box whose LONG side is 1 unit and short side is `hMm/wMm`. The
 * top face (+Z) carries the design, with u along the long side so the value
 * reads horizontally.
 */
export function makeBill(wMm: number, hMm: number, thickness = 0.02): Mesh {
  const hx = 0.5;
  const hy = 0.5 * (hMm / wMm);
  const hz = thickness / 2;
  // 0..3 bottom (z=−hz), 4..7 top (z=+hz), each ring CCW seen from +Z.
  const verts: Vec3[] = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const faces: Face[] = [
    // Top: [4,5,6,7] → u = 4→5 = +X, v = +Y. Label room = the short half-side.
    framedFace(verts, [4, 5, 6, 7], [0, 0, 1], [1, 0, 0], "top", hy * 0.9),
    framedFace(verts, [3, 2, 1, 0], [0, 0, -1], [1, 0, 0], "bottom"),
    derivedFace(verts, [0, 1, 5, 4], [0, -1, 0], "side"),
    derivedFace(verts, [1, 2, 6, 5], [1, 0, 0], "side"),
    derivedFace(verts, [2, 3, 7, 6], [0, 1, 0], "side"),
    derivedFace(verts, [3, 0, 4, 7], [-1, 0, 0], "side"),
  ];
  return { vertices: verts, faces, topFace: 0 };
}

// Memoised meshes — geometry is fixed per (segments, aspect); notes vary only by
// aspect ratio, so cache on a rounded aspect key.
let COIN: Mesh | null = null;
export function coinMesh(): Mesh {
  return (COIN ??= makeCoin());
}
const BILLS = new Map<string, Mesh>();
export function billMesh(wMm: number, hMm: number): Mesh {
  const key = (hMm / wMm).toFixed(3);
  let m = BILLS.get(key);
  if (!m) {
    m = makeBill(wMm, hMm);
    BILLS.set(key, m);
  }
  return m;
}
