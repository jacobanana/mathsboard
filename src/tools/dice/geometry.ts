// The dice geometry + a tiny 3D engine.
//
// A "realistic" die is a real polyhedron that tumbles and settles with one face
// toward the viewer. So this module is pure maths — vector/quaternion helpers,
// the five standard polyhedral dice as vertex/face data, and the two rotations
// the widget animates between:
//   - faceUpQuat(solid, value): the RESTING orientation showing `value` on top
//     (its face normal aimed at the camera, its number upright).
//   - rollQuat(from, target, turns, p): the orientation partway through a roll —
//     built so p=0 gives `from` and p=1 gives `target`, with `turns` extra whole
//     spins in between (the tumble). The widget drives p from 0→1 with an
//     ease-out, so angular speed is high at the flick and eases to rest.
//
// The solids are the standard tabletop set: d6 cube (pips), d8 octahedron, d10
// pentagonal trapezohedron, d12 dodecahedron, d20 icosahedron. Platonic faces
// are derived from their face-centre DIRECTIONS (the dual solid's vertices) so
// there are no hand-typed, error-prone index tables; the d10 is built directly.
//
// Everything is camera-space with +Z pointing at the viewer: a face is "up"
// (visible, readable) when its rotated normal has z > 0.

export type Vec3 = [number, number, number];
/** Unit quaternion [x, y, z, w] (w is the scalar part). */
export type Quat = [number, number, number, number];

// --- vectors ----------------------------------------------------------------

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// --- quaternions ------------------------------------------------------------
// Rotation of a vector v by q is v' = q v q*. Composition q = a·b means "apply b
// then a". q and -q denote the same rotation, so rendering (rotateVec) is sign-
// invariant — which the roll animation relies on for a seamless start.

export const qMul = (a: Quat, b: Quat): Quat => {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
};

export const qConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export const qFromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const [x, y, z] = normalize(axis);
  const h = angle / 2;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
};

/** Rotate vector v by unit quaternion q (v' = v + 2·q.xyz × (q.xyz × v + w·v)). */
export const rotateVec = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
};

/** Shortest rotation taking unit vector `from` onto unit vector `to`. */
export const qFromTo = (from: Vec3, to: Vec3): Quat => {
  const d = dot(from, to);
  if (d > 0.999999) return [0, 0, 0, 1]; // already aligned
  if (d < -0.999999) {
    // Opposite: 180° about any axis perpendicular to `from`.
    let axis = cross(from, [1, 0, 0]);
    if (length(axis) < 1e-4) axis = cross(from, [0, 1, 0]);
    return qFromAxisAngle(axis, Math.PI);
  }
  return qFromAxisAngle(cross(from, to), Math.acos(Math.max(-1, Math.min(1, d))));
};

/** Axis + angle (angle in [0, π], taking the short way round) of unit quat q. */
export const qToAxisAngle = (q: Quat): { axis: Vec3; angle: number } => {
  // q and -q are the same rotation; pick w ≥ 0 so the angle is the short one.
  let [x, y, z, w] = q;
  if (w < 0) [x, y, z, w] = [-x, -y, -z, -w];
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) return { axis: [1, 0, 0], angle: 0 };
  return { axis: [x / s, y / s, z / s], angle: 2 * Math.acos(Math.min(1, w)) };
};

// --- solids -----------------------------------------------------------------

export interface DieFace {
  /** Vertex indices in CCW order (viewed from outside). */
  indices: number[];
  /** The number printed on this face (1..N). */
  value: number;
  /** Face centroid (world space, solid at rest). */
  center: Vec3;
  /** Outward unit normal. */
  normal: Vec3;
  /** In-plane unit basis (u across, v up) — shared by orientation & rendering. */
  u: Vec3;
  v: Vec3;
  /** Distance from the centre to the nearest edge — the room a number/pips have
   *  to fit. Used to size the printing so it scales per die AND per face. */
  inradius: number;
}

export interface Solid {
  vertices: Vec3[];
  faces: DieFace[];
  /** value -> its face. */
  byValue: Map<number, DieFace>;
  /** Presentation tilt (radians): how far off dead-on to tip the resting die so
   *  it reads as 3D without hiding the top face. Kept below half the nearest
   *  face-to-face normal angle, so the chosen face always stays the most-facing
   *  (you never read a neighbour by mistake) — hence smaller for denser dice. */
  tilt: number;
}

export const DICE_FACES = [4, 6, 8, 10, 12, 20] as const;
export type FaceCount = (typeof DICE_FACES)[number];

export const isFaceCount = (n: number): n is FaceCount =>
  (DICE_FACES as readonly number[]).includes(n);

export const dieLabel = (faces: FaceCount): string => "d" + faces;

const PHI = (1 + Math.sqrt(5)) / 2;

/** Resting tilt off dead-on (radians ≈ 8°): almost flat, just a hint of depth. */
const PRESENTATION_TILT = 0.14;

// Vertex sets for the Platonic solids (before normalising to unit circumradius).
const tetraVerts = (): Vec3[] => [
  [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1], // alternate cube corners
];
const cubeVerts = (): Vec3[] => {
  const v: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  return v;
};
const octaVerts = (): Vec3[] => [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
// The icosahedron (d20), with the classic icosphere vertex ordering and its
// matching 20-triangle list. Using an explicit face list (not "nearest 3 to a
// direction") is what makes the triangles the ACTUAL faces — a wrong triple is
// still coplanar, so a nearest-N heuristic can pick a bogus face undetectably.
const ICOSA_VERTS: Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICOSA_FACES: number[][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** Newell's method: robust polygon normal (handles slightly non-planar quads). */
function polygonNormal(pts: Vec3[]): Vec3 {
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

/** Centroid of the given points. */
function centroid(pts: Vec3[]): Vec3 {
  const c = pts.reduce<Vec3>((s, p) => add(s, p), [0, 0, 0]);
  return mul(c, 1 / pts.length);
}

/**
 * Build a face from a set of vertex indices: fill in centroid, normal and an
 * in-plane basis. By default the indices are ordered CCW about the face-centre
 * direction `dir` (works for any convex PLANAR face — triangles, quads,
 * pentagons). Pass `keepOrder` when the caller already has the perimeter order —
 * the d10's kites are non-planar, so angular sorting can mis-thread them.
 */
function buildFace(
  vertices: Vec3[],
  idx: number[],
  dir: Vec3,
  keepOrder = false,
): Omit<DieFace, "value"> {
  const c = centroid(idx.map((i) => vertices[i]));
  let ordered: number[];
  if (keepOrder) {
    ordered = [...idx];
  } else {
    // A stable in-plane basis perpendicular to the face direction.
    const n0 = normalize(dir);
    let u = cross(n0, Math.abs(n0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    u = normalize(u);
    const w = cross(n0, u);
    // Sort vertices by angle around the centre, in the (u, w) plane.
    ordered = [...idx].sort((a, b) => {
      const pa = sub(vertices[a], c);
      const pb = sub(vertices[b], c);
      return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u));
    });
  }
  const pts = ordered.map((i) => vertices[i]);
  let normal = polygonNormal(pts);
  if (dot(normal, dir) < 0) {
    ordered.reverse();
    normal = mul(normal, -1);
  }
  // Rendering/orientation basis: an ORTHONORMAL tangent frame on the face plane
  // (u toward the first vertex, projected onto the plane so it's exactly ⟂ the
  // normal even when the face isn't perfectly planar — e.g. the d10's kites).
  const d0 = sub(vertices[ordered[0]], c);
  const uAxis = normalize(sub(d0, mul(normal, dot(d0, normal))));
  const vAxis = normalize(cross(normal, uAxis));
  // Inradius: the shortest centre-to-edge distance (perpendicular distance from
  // the centroid to each edge line, minimised over edges).
  let inradius = Infinity;
  for (let i = 0; i < ordered.length; i++) {
    const p1 = vertices[ordered[i]];
    const p2 = vertices[ordered[(i + 1) % ordered.length]];
    const e = sub(p2, p1);
    const d = length(cross(sub(c, p1), e)) / (length(e) || 1);
    if (d < inradius) inradius = d;
  }
  return { indices: ordered, center: c, normal, u: uAxis, v: vAxis, inradius };
}

/**
 * Faces of a convex solid from its face-centre DIRECTIONS: each face is the `n`
 * vertices nearest that direction (largest dot product). Used for all four
 * Platonic dice via their dual's vertices.
 */
function facesFromDirections(vertices: Vec3[], dirs: Vec3[], n: number): Omit<DieFace, "value">[] {
  return dirs.map((dir) => {
    const idx = vertices
      .map((v, i) => ({ i, d: dot(v, dir) }))
      .sort((a, b) => b.d - a.d)
      .slice(0, n)
      .map((e) => e.i);
    return buildFace(vertices, idx, dir);
  });
}

/**
 * The d10: a pentagonal trapezohedron — two apexes and a 10-vertex zig-zag
 * girdle, with 10 FLAT kite faces (it's a real polyhedron, so opposite faces are
 * parallel — that's what lets it rest on any face). Planarity is not free: for a
 * girdle at z = ±c and radius 1, the apex height H is DETERMINED (H·(1−cosα) =
 * c·(1+cosα), α = 36°). Each apex-kite is centred on the OPPOSITE-side girdle
 * vertex (a top kite's far tip dips just below the equator), with its two wings
 * on the near girdle — get that backwards and the "kite" is a non-planar quad
 * that folds into a self-intersecting star when projected.
 */
function trapezohedronFaces(): { vertices: Vec3[]; faces: Omit<DieFace, "value">[] } {
  const r = 1;
  // Girdle half-height. With flat kites the apex height H = c·(1+cos36°)/(1−cos36°)
  // ≈ 9.47·c is forced, so H/r (the pole-to-girdle elongation) IS 9.47·c — this
  // is the only handle on how long the die is. 0.135 -> ~1.3× (a real-ish d10,
  // not the over-long ~1.9× that 0.2 gives).
  const c = 0.135;
  const cosA = Math.cos(Math.PI / 5); // 36°
  const H = (c * (1 + cosA)) / (1 - cosA); // apex height for planar kites
  const ring: Vec3[] = [];
  for (let j = 0; j < 10; j++) {
    const ang = (j * Math.PI) / 5; // 36° steps
    ring.push([r * Math.cos(ang), r * Math.sin(ang), j % 2 === 0 ? c : -c]);
  }
  const vertices: Vec3[] = [[0, 0, H], [0, 0, -H], ...ring]; // 0=N, 1=S, 2..11=ring
  const ri = (j: number) => 2 + (((j % 10) + 10) % 10);
  const faces: Omit<DieFace, "value">[] = [];
  for (let j = 0; j < 10; j++) {
    // The kite centred on girdle vertex j takes the FAR apex: a down vertex
    // (j odd) belongs to a north-apex kite, an up vertex (j even) to the south.
    const apex = j % 2 === 0 ? 1 : 0;
    // Perimeter order: apex, wing, far tip (ring[j]), wing.
    const idx = [apex, ri(j - 1), ri(j), ri(j + 1)];
    faces.push(buildFace(vertices, idx, centroid(idx.map((i) => vertices[i])), true));
  }
  return { vertices, faces };
}

/** d20 faces: the trusted icosahedron triangles, each built with its centroid
 *  as the outward direction. */
function icosaFaces(): Omit<DieFace, "value">[] {
  return ICOSA_FACES.map((tri) =>
    buildFace(ICOSA_VERTS, tri, centroid(tri.map((i) => ICOSA_VERTS[i]))),
  );
}

/** The d12 as the DUAL of the trusted icosahedron: each dodeca vertex is an
 *  icosa face centre, and each dodeca face gathers the 5 dodeca vertices around
 *  one icosa vertex — whose direction IS that pentagon's outward normal (by
 *  duality), so buildFace orders and orients it correctly. */
function dodecaFromIcosa(): { vertices: Vec3[]; faces: Omit<DieFace, "value">[] } {
  const vertices = ICOSA_FACES.map((tri) =>
    normalize(centroid(tri.map((i) => ICOSA_VERTS[i]))),
  );
  const faces = ICOSA_VERTS.map((dir, i) => {
    const incident = ICOSA_FACES.reduce<number[]>((acc, tri, k) => {
      if (tri.includes(i)) acc.push(k);
      return acc;
    }, []);
    return buildFace(vertices, incident, dir);
  });
  return { vertices, faces };
}

/** Assign values, normalise to unit circumradius, and index by value. */
function assemble(vertices: Vec3[], raw: Omit<DieFace, "value">[]): Solid {
  const r = Math.max(...vertices.map(length)) || 1;
  const verts = vertices.map((v) => mul(v, 1 / r));
  const faces: DieFace[] = raw.map((f, i) => ({
    ...f,
    center: mul(f.center, 1 / r),
    inradius: f.inradius / r,
    value: i + 1,
  }));
  const byValue = new Map(faces.map((f) => [f.value, f]));
  // A small, almost-flat presentation tilt: enough to hint at depth (a sliver of
  // the sides shows, the number stays clear and near face-on), never a 3/4 view.
  // Capped under half the nearest face-to-face normal angle so the chosen face
  // is always the most-facing one — for the denser dice that cap is what bites.
  let minAngle = Math.PI;
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = Math.acos(Math.max(-1, Math.min(1, dot(faces[i].normal, faces[j].normal))));
      if (a < minAngle) minAngle = a;
    }
  }
  const tilt = Math.min(PRESENTATION_TILT, 0.42 * minAngle);
  return { vertices: verts, faces, byValue, tilt };
}

const SOLIDS: Partial<Record<FaceCount, Solid>> = {};

/** The solid for a die (memoised — the geometry is fixed per face count). */
export function makeSolid(faces: FaceCount): Solid {
  const cached = SOLIDS[faces];
  if (cached) return cached;
  let solid: Solid;
  switch (faces) {
    case 4:
      // Each tetra face is opposite a vertex, so its outward normal points along
      // the negated vertex — the 3 nearest vertices to that direction.
      solid = assemble(
        tetraVerts(),
        facesFromDirections(tetraVerts(), tetraVerts().map((v) => mul(v, -1)), 3),
      );
      break;
    case 6:
      solid = assemble(
        cubeVerts(),
        facesFromDirections(cubeVerts(), octaVerts(), 4),
      );
      break;
    case 8:
      solid = assemble(
        octaVerts(),
        facesFromDirections(octaVerts(), cubeVerts(), 3),
      );
      break;
    case 10: {
      const { vertices, faces: fs } = trapezohedronFaces();
      solid = assemble(vertices, fs);
      break;
    }
    case 12: {
      const { vertices, faces: fs } = dodecaFromIcosa();
      solid = assemble(vertices, fs);
      break;
    }
    case 20:
      solid = assemble(ICOSA_VERTS, icosaFaces());
      break;
  }
  SOLIDS[faces] = solid;
  return solid;
}

// --- orientation ------------------------------------------------------------

// Tilt axis: mostly "look down at the die on a table" (about screen-X, which
// keeps the number upright and shows the top faces) with a slight turn (−Y) so a
// side reads too. Kept gentle so the result face stays clear and readable.
const TILT_AXIS: Vec3 = normalize([1, -0.4, 0]);

/** Resting orientation showing `value`: the face upright and toward the camera,
 *  then tipped just enough (solid.tilt about TILT_AXIS) to read as 3D while the
 *  face stays the clearest, most-facing one. */
export function faceUpQuat(solid: Solid, value: number): Quat {
  const f = solid.byValue.get(value) ?? solid.faces[0];
  const q1 = qFromTo(f.normal, [0, 0, 1]);
  // Spin about +Z so the face's up-axis points up on screen (before the tilt).
  const vr = rotateVec(q1, f.v);
  const align = qFromAxisAngle([0, 0, 1], Math.PI / 2 - Math.atan2(vr[1], vr[0]));
  return qMul(qFromAxisAngle(TILT_AXIS, solid.tilt), qMul(align, q1));
}

/**
 * Orientation partway through a roll. `p` in [0,1] is the eased progress:
 *   p = 0 -> exactly `from`   (seamless start from where the die rests)
 *   p = 1 -> exactly `target` (the new resting face)
 * In between the die spins `turns` extra whole revolutions about the axis that
 * separates the two orientations, so it reads as a real tumble.
 */
export function rollQuat(from: Quat, target: Quat, turns: number, p: number): Quat {
  const delta = qMul(qConj(target), from); // rotation from target back to `from`
  const { axis, angle } = qToAxisAngle(delta);
  const phi = (angle + 2 * Math.PI * turns) * (1 - p);
  return qMul(target, qFromAxisAngle(axis, phi));
}
