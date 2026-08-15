// The tool UI table (R5): the dock, the tool shortcuts and the options pill
// all map over TOOL_UI, so these invariants ARE user-facing behaviour — a
// spec without a controller is a dead dock button; a controller without a
// spec is an unreachable tool; a spec whose shortcut id isn't in the catalog
// has a blank tooltip hint.

import { beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import { TOOL_UI, dockPick, toolUiFor } from "@/ui/toolSpecs";
import { keyHint } from "@/ui/shortcuts";
import { getInteraction, listInteractions } from "@/canvas/interactions";
import { useBoardStore } from "@/board/store";
import { useUiStore } from "@/ui/uiStore";
import { freshBoard } from "@/testing/fixtures";

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

// The dock press rule: arriving at a tool shows its options pill, pressing the
// button of the tool you're already on folds that pill away — and neither one
// touches a setting inside it (the complaint was the draw pill eating the
// screen, not the pen it was set to).
describe("dockPick (the dock press rule)", () => {
  const st = () => useBoardStore.getState();
  const ui = () => useUiStore.getState();

  beforeEach(() => {
    freshBoard();
    ui().setOptionsOpen(true);
  });

  it("activates the tool and shows its options", () => {
    ui().setOptionsOpen(false);
    dockPick("pen");
    expect(st().tool).toBe("pen");
    expect(ui().optionsOpen).toBe(true);
  });

  it("folds the pill away when the tool is already active, and back again", () => {
    dockPick("pen");
    dockPick("pen");
    expect(ui().optionsOpen).toBe(false);
    expect(st().tool).toBe("pen"); // still the draw tool
    dockPick("pen");
    expect(ui().optionsOpen).toBe(true);
  });

  it("never changes the tool's own settings", () => {
    dockPick("pen");
    st().setDrawMode("triangle");
    const size = st().sizes;
    dockPick("pen"); // fold
    dockPick("pen"); // unfold
    expect(st().drawMode).toBe("triangle");
    expect(st().sizes).toBe(size);
  });

  it("the pointer's own pick lands the pointer while aiming, and folds after", () => {
    const select = toolUiFor("select")!;
    select.pick!();
    expect(st().tool).toBe("select");
    st().setLaserMode(true);
    select.pick!(); // aiming -> back to the plain pointer, pill stays
    expect(st().laserMode).toBe(false);
    expect(ui().optionsOpen).toBe(true);
    select.pick!(); // already the plain pointer -> fold
    expect(ui().optionsOpen).toBe(false);
  });
});
