// Coin & note meshes are well-formed solids: closed manifolds (Euler holds,
// every edge shared by two faces), outward unit normals with an orthonormal
// in-plane frame, and the two discs of a coin parallel and a thickness apart.

import { describe, expect, it } from "vitest";
import { length, dot, rotateVec, type Quat, type Vec3 } from "@/tools/dice/geometry";
import {
  makeBill,
  makeCoin,
  pieceQuat,
  type Mesh,
} from "@/tools/money/geometry";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const quatLen = (q: Quat) => Math.hypot(q[0], q[1], q[2], q[3]);

function assertManifold(mesh: Mesh) {
  const edges = new Map<string, number>();
  for (const f of mesh.faces) {
    const idx = f.indices;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[i];
      const b = idx[(i + 1) % idx.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) expect(count).toBe(2);
  // Euler for a sphere-topology solid.
  expect(mesh.vertices.length - edges.size + mesh.faces.length).toBe(2);
}

function assertFrames(mesh: Mesh) {
  for (const f of mesh.faces) {
    expect(near(length(f.normal), 1, 1e-9)).toBe(true);
    expect(near(length(f.u), 1, 1e-9)).toBe(true);
    expect(near(length(f.v), 1, 1e-9)).toBe(true);
    // Orthonormal, tangent to the face.
    expect(near(dot(f.u, f.v), 0, 1e-9)).toBe(true);
    expect(near(dot(f.u, f.normal), 0, 1e-9)).toBe(true);
    // Outward: normal agrees with the direction from the centroid origin.
    expect(dot(f.normal, f.center)).toBeGreaterThan(0);
    // Every vertex lies in the face plane.
    for (const i of f.indices) {
      expect(near(dot([
        mesh.vertices[i][0] - f.center[0],
        mesh.vertices[i][1] - f.center[1],
        mesh.vertices[i][2] - f.center[2],
      ] as Vec3, f.normal), 0, 1e-9)).toBe(true);
    }
  }
}

describe("makeCoin", () => {
  const segs = 32;
  const thickness = 0.14;
  const coin = makeCoin(segs, thickness);

  it("has 2·segments vertices and segments+2 faces", () => {
    expect(coin.vertices.length).toBe(2 * segs);
    expect(coin.faces.length).toBe(segs + 2);
  });

  it("is a closed manifold", () => assertManifold(coin));
  it("has outward unit normals and orthonormal frames", () => assertFrames(coin));

  it("top and bottom discs are parallel and a thickness apart", () => {
    const top = coin.faces.find((f) => f.kind === "top")!;
    const bot = coin.faces.find((f) => f.kind === "bottom")!;
    expect(near(dot(top.normal, bot.normal), -1, 1e-9)).toBe(true);
    expect(near(top.center[2] - bot.center[2], thickness, 1e-9)).toBe(true);
    // The printed disc faces +Z and reserves room for the label.
    expect(coin.topFace).toBe(coin.faces.indexOf(top));
    expect(near(top.normal[2], 1, 1e-9)).toBe(true);
    expect(top.inradius).toBeGreaterThan(0);
  });
});

describe("makeBill", () => {
  const bill = makeBill(140, 77);

  it("is a box: 8 vertices, 6 faces, closed manifold", () => {
    expect(bill.vertices.length).toBe(8);
    expect(bill.faces.length).toBe(6);
    assertManifold(bill);
  });

  it("has outward unit normals and orthonormal frames", () => assertFrames(bill));

  it("prints on the +Z face with the long side horizontal", () => {
    const top = bill.faces[bill.topFace];
    expect(top.kind).toBe("top");
    expect(near(top.normal[2], 1, 1e-9)).toBe(true);
    expect(near(top.u[0], 1, 1e-9)).toBe(true); // u along the long (X) side
  });
});

describe("pieceQuat", () => {
  it("returns unit quaternions and tips the piece toward the viewer", () => {
    for (const kind of ["coin", "bill"] as const) {
      const q = pieceQuat(kind, 0.3);
      expect(near(quatLen(q), 1, 1e-9)).toBe(true);
      // The top normal still faces the camera (+Z) after the tilt...
      const nz = rotateVec(q, [0, 0, 1])[2];
      expect(nz).toBeGreaterThan(0.7);
      expect(nz).toBeLessThan(0.9999); // ...but not dead-on
    }
  });
});
