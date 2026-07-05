// The tool UI table (R5): the dock, the tool shortcuts and the options pill
// all map over TOOL_UI, so these invariants ARE user-facing behaviour — a
// spec without a controller is a dead dock button; a controller without a
// spec is an unreachable tool; a spec whose shortcut id isn't in the catalog
// has a blank tooltip hint.

import { describe, expect, it } from "vitest";
import "@/tools";
import { TOOL_UI } from "@/ui/toolSpecs";
import { keyHint } from "@/ui/shortcuts";
import { getInteraction, listInteractions } from "@/canvas/interactions";

describe("TOOL_UI ↔ interaction registry", () => {
  it("every dock spec has a registered interaction controller", () => {
    for (const spec of TOOL_UI) {
      expect(getInteraction(spec.tool), spec.tool).toBeDefined();
    }
  });

  it("every registered interaction tool has a dock spec (no unreachable tools)", () => {
    const specced = new Set(TOOL_UI.map((t) => t.tool));
    for (const ctrl of listInteractions()) {
      expect(specced.has(ctrl.tool), ctrl.tool).toBe(true);
    }
  });

  it("dock DOM ids and shortcut ids are unique", () => {
    const domIds = TOOL_UI.map((t) => t.domId);
    const shortcutIds = TOOL_UI.map((t) => t.shortcut.id);
    expect(new Set(domIds).size).toBe(domIds.length);
    expect(new Set(shortcutIds).size).toBe(shortcutIds.length);
  });

  it("every spec's shortcut resolves to a key hint and its title renders it", () => {
    for (const spec of TOOL_UI) {
      const hint = keyHint(spec.shortcut.id);
      expect(hint, spec.tool).not.toBe("");
      expect(spec.title(hint), spec.tool).toContain(hint);
    }
  });
});
