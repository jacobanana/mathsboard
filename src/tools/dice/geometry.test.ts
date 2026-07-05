// The dice geometry: every solid is a well-formed die (right face count, values
// 1..N, outward unit normals on a unit circumsphere), and the two rotations the
// widget animates behave — faceUpQuat brings a face to the camera upright, and
// rollQuat lands exactly on it while starting seamlessly from the prior pose.

import { describe, expect, it } from "vitest";
import {
  DICE_FACES,
  makeSolid,
  faceUpQuat,
  rollQuat,
  rotateVec,
  length,
  dot,
  sub,
  type Quat,
  type Vec3,
} from "@/tools/dice/geometry";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const quatLen = (q: Quat) => Math.hypot(q[0], q[1], q[2], q[3]);

describe.each(DICE_FACES)("d%i", (faces) => {
  const solid = makeSolid(faces);

  it("has exactly `faces` faces", () => {
    expect(solid.faces.length).toBe(faces);
  });

  it("prints each value 1..N exactly once", () => {
    const values = solid.faces.map((f) => f.value).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: faces }, (_, i) => i + 1));
  });

  it("sits on a unit circumsphere", () => {
    for (const v of solid.vertices) expect(v.length).toBe(3);
    const maxR = Math.max(...solid.vertices.map(length));
    expect(near(maxR, 1, 1e-9)).toBe(true);
  });

  it("has the expected polygon per face", () => {
    const sides: Record<number, number> = { 4: 3, 6: 4, 8: 3, 10: 4, 12: 5, 20: 3 };
    for (const f of solid.faces) expect(f.indices.length).toBe(sides[faces]);
  });

  it("is a closed manifold (every edge shared by two faces; Euler holds)", () => {
    const edges = new Map<string, number>();
    for (const f of solid.faces) {
      const idx = f.indices;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[i];
        const b = idx[(i + 1) % idx.length];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const count of edges.values()) expect(count).toBe(2);
    // Euler's formula for a sphere: V - E + F = 2.
    expect(solid.vertices.length - edges.size + solid.faces.length).toBe(2);
  });

  it("has outward unit normals", () => {
    for (const f of solid.faces) {
      expect(near(length(f.normal), 1, 1e-9)).toBe(true);
      // Outward: the normal agrees with the direction from the origin.
      expect(dot(f.normal, f.center)).toBeGreaterThan(0);
      // The in-plane basis is orthonormal and tangent to the face.
      expect(near(dot(f.u, f.v), 0, 1e-9)).toBe(true);
      expect(near(dot(f.u, f.normal), 0, 1e-6)).toBe(true);
    }
  });

  it("has flat faces (every vertex lies in its face plane)", () => {
    // A real polyhedron has planar faces; a non-planar quad folds into a
    // self-intersecting star when projected (the d10 bug). This guards it.
    for (const f of solid.faces) {
      for (const i of f.indices) {
        const d = dot(sub(solid.vertices[i], f.center), f.normal);
        expect(near(d, 0, 1e-9)).toBe(true);
      }
    }
  });

  it("shows the chosen face near-flat, clearest and most-facing", () => {
    for (const f of solid.faces) {
      const q = faceUpQuat(solid, f.value);
      expect(near(quatLen(q), 1, 1e-6)).toBe(true);
      // The chosen face is the MOST camera-facing (it's what you read)...
      const nz = rotateVec(q, f.normal)[2];
      const maxNz = Math.max(...solid.faces.map((g) => rotateVec(q, g.normal)[2]));
      expect(nz).toBe(maxNz);
      // ...almost flat to the camera (very readable), but not perfectly dead-on
      // (a sliver of depth remains).
      expect(nz).toBeGreaterThan(0.95);
      expect(nz).toBeLessThan(0.9999);
      // Its number stays upright (up-axis points up on screen).
      expect(rotateVec(q, f.v)[1]).toBeGreaterThan(0.8);
    }
  });

  it("rollQuat lands exactly on the target orientation", () => {
    const from = faceUpQuat(solid, 1);
    const target = faceUpQuat(solid, faces); // roll from face 1 to face N
    const end = rollQuat(from, target, 4, 1);
    // Same rotation as target (compare by how they rotate probes; q ~ -q).
    for (const p of [[1, 0, 0], [0, 1, 0], [0.4, -0.5, 0.7]] as Vec3[]) {
      const a = rotateVec(end, p);
      const b = rotateVec(target, p);
      expect(near(a[0], b[0], 1e-5) && near(a[1], b[1], 1e-5) && near(a[2], b[2], 1e-5)).toBe(true);
    }
    // ...and that orientation makes face N the most camera-facing.
    const nz = rotateVec(end, solid.byValue.get(faces)!.normal)[2];
    const maxNz = Math.max(...solid.faces.map((g) => rotateVec(end, g.normal)[2]));
    expect(nz).toBe(maxNz);
  });

  it("rollQuat starts seamlessly from the prior pose", () => {
    const from = faceUpQuat(solid, 2 <= faces ? 2 : 1);
    const target = faceUpQuat(solid, faces);
    const start = rollQuat(from, target, 4, 0);
    // q and -q are the same rotation, so compare by how they rotate probes.
    const probes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.6, 0.7]];
    for (const p of probes) {
      const a = rotateVec(start, p);
      const b = rotateVec(from, p);
      expect(near(a[0], b[0], 1e-5)).toBe(true);
      expect(near(a[1], b[1], 1e-5)).toBe(true);
      expect(near(a[2], b[2], 1e-5)).toBe(true);
    }
  });
});
