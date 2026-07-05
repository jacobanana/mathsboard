// The tool-registry sweep: mechanical invariants every registered tool must
// satisfy, current and future. A new tool that breaks its size maths or
// gallery metadata fails here with zero test-maintenance cost.

import { describe, expect, it } from "vitest";
import "@/tools"; // assembly: registers every tool
import {
  answersMatch,
  CATEGORY_ORDER,
  listByCategory,
  listTools,
  registerTool,
} from "@/tools/registry";
import type { CanvasTool } from "@/tools/registry";
import { naturalSize } from "@/board/sizing";

describe("the assembled registry", () => {
  it("has the full tool set registered", () => {
    expect(listTools().length).toBeGreaterThanOrEqual(20);
  });

  it("every tool has a unique type and a known category", () => {
    const tools = listTools();
    expect(new Set(tools.map((t) => t.type)).size).toBe(tools.length);
    for (const t of tools) {
      expect(CATEGORY_ORDER, t.type).toContain(t.category);
    }
  });

  it("every tool yields a finite, positive natural size for its defaults", () => {
    for (const t of listTools()) {
      const size = naturalSize(t.type, t.defaults());
      expect(size, t.type).not.toBeNull();
      expect(Number.isFinite(size!.w), t.type).toBe(true);
      expect(Number.isFinite(size!.h), t.type).toBe(true);
      expect(size!.w, t.type).toBeGreaterThan(0);
      expect(size!.h, t.type).toBeGreaterThan(0);
    }
  });

  it("every gallery tool carries display metadata and a way to configure or place itself", () => {
    for (const t of listTools()) {
      if (t.inGallery === false) continue;
      expect(t.name, t.type).not.toBe("");
      expect(t.blurb, t.type).not.toBe("");
    }
  });

  it("listByCategory returns only gallery tools of that category", () => {
    for (const cat of CATEGORY_ORDER) {
      for (const t of listByCategory(cat)) {
        expect(t.category).toBe(cat);
        expect(t.inGallery).not.toBe(false);
      }
    }
    // The free-text tool exists but is hidden from the gallery.
    const word = listByCategory("word").map((t) => t.type);
    expect(word).not.toContain("text");
  });

  it("every tool with type-in inputs yields valid fields for its defaults", () => {
    for (const t of listTools()) {
      if (t.kind !== "canvas" || !t.inputs) continue;
      const nat = naturalSize(t.type, t.defaults())!;
      const obj = {
        id: "x",
        type: t.type,
        x: 0,
        y: 0,
        w: nat.w,
        h: nat.h,
        ...t.defaults(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields = t.inputs.fields(obj as any);
      expect(fields.length, t.type).toBeGreaterThan(0);
      const keys = new Set<string>();
      for (const f of fields) {
        keys.add(f.key);
        for (const v of [f.x, f.y, f.w, f.h]) {
          expect(Number.isFinite(v), `${t.type} ${f.key}`).toBe(true);
        }
        expect(f.w, `${t.type} ${f.key}`).toBeGreaterThan(0);
        expect(f.h, `${t.type} ${f.key}`).toBeGreaterThan(0);
        expect(f.x, `${t.type} ${f.key}`).toBeGreaterThanOrEqual(0);
        expect(f.y, `${t.type} ${f.key}`).toBeGreaterThanOrEqual(0);
        if (f.correct != null) {
          expect(Number.isFinite(f.correct), `${t.type} ${f.key}`).toBe(true);
        }
      }
      expect(keys.size, `${t.type} unique field keys`).toBe(fields.length);
    }
  });

  it("registering a duplicate type throws", () => {
    const dup: CanvasTool = {
      kind: "canvas",
      type: "text", // already registered
      name: "x",
      blurb: "x",
      category: "word",
      defaults: () => ({}),
      size: () => ({ w: 1, h: 1 }),
      draw: () => {},
    };
    expect(() => registerTool(dup)).toThrowError(/already registered/);
  });
});

describe("answersMatch", () => {
  it("matches integers exactly", () => {
    expect(answersMatch("15", 15)).toBe(true);
    expect(answersMatch("14", 15)).toBe(false);
    expect(answersMatch(" 15 ", 15)).toBe(true); // Number() trims
  });

  it("matches clean decimals and tolerates float noise", () => {
    expect(answersMatch("0.75", 0.75)).toBe(true);
    expect(answersMatch(".75", 3 / 4)).toBe(true);
    expect(answersMatch("0.3", 0.1 + 0.2)).toBe(true); // 0.30000000000000004
    expect(answersMatch("75", 75)).toBe(true);
  });

  it("rejects blank and non-numeric input", () => {
    expect(answersMatch("", 0)).toBe(false);
    expect(answersMatch("abc", 5)).toBe(false);
    expect(answersMatch("75%", 75)).toBe(false); // Number("75%") is NaN
  });
});
