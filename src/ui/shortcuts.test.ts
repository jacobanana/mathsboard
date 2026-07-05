// The keyboard-shortcut catalog + dispatcher. Dispatch is BEHAVIOUR here:
// entries run first-match-wins in array order, gated by the modal flag, the
// in-place text editor, and form-field focus — regressions in any of those
// reach every shortcut at once. Assertions observe the store / host, never
// the catalog internals (except the explicit catalog-invariant block, which
// pins the single-source-of-truth contract the help page relies on).

import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/tools";
import {
  handleShortcut,
  keyHint,
  SHORTCUTS,
  shortcutsByGroup,
  type ShortcutHost,
} from "@/ui/shortcuts";
import { useBoardStore } from "@/board/store";
import { useUiStore } from "@/ui/uiStore";
import { resetClipboard } from "@/board/commands";
import { id as newId } from "@/board/types";
import {
  PALETTE,
  FILL_PALETTE,
  LASER_PALETTE,
  PEN_SIZE_RANGE,
  HIGHLIGHTER_SIZE_RANGE,
  SHAPE_WIDTH_RANGE,
} from "@/ui/constants";
import { anObject, aStroke, freshBoard, keydown } from "@/testing/fixtures";

const st = () => useBoardStore.getState();

let host: ShortcutHost;
let hostCalls: string[];

const fire = (e: KeyboardEvent) => handleShortcut(e, host);

beforeEach(() => {
  freshBoard();
  resetClipboard();
  useUiStore.setState({ modalOpen: false });
  hostCalls = [];
  const log = (name: string) => () => hostCalls.push(name);
  host = {
    save: log("save"),
    saveAs: log("saveAs"),
    openInsert: log("openInsert"),
    openImage: log("openImage"),
    openHelp: log("openHelp"),
  };
});

describe("gates", () => {
  it("nothing fires while a modal is open", () => {
    useUiStore.setState({ modalOpen: true });
    expect(fire(keydown("d"))).toBe(false);
    expect(st().tool).toBe("pen");
    expect(fire(keydown("s", { ctrl: true }))).toBe(false);
    expect(hostCalls).toEqual([]);
  });

  it("during in-place text editing only whileEditing shortcuts (Save) fire", () => {
    st().setEditingId("some-text");
    expect(fire(keydown("d"))).toBe(false);
    expect(st().tool).toBe("pen");

    expect(fire(keydown("s", { ctrl: true }))).toBe(true);
    expect(fire(keydown("s", { ctrl: true, shift: true }))).toBe(true);
    expect(hostCalls).toEqual(["save", "saveAs"]);
  });

  it("bare keys are suppressed while typing in a form field, Ctrl+S is not", () => {
    const input = document.createElement("input");
    expect(fire(keydown("d", { target: input }))).toBe(false);
    expect(st().tool).toBe("pen");

    expect(fire(keydown("s", { ctrl: true, target: input }))).toBe(true);
    expect(hostCalls).toEqual(["save"]);
  });
});

describe("dispatch", () => {
  it("Ctrl+Z undoes and Ctrl+Shift+Z redoes (precedence between the two combos)", () => {
    st().addStroke(aStroke());

    expect(fire(keydown("z", { ctrl: true }))).toBe(true);
    expect(st().board.strokes).toHaveLength(0);

    expect(fire(keydown("z", { ctrl: true, shift: true }))).toBe(true);
    expect(st().board.strokes).toHaveLength(1);
  });

  it("the Cmd key works as the primary modifier", () => {
    st().addStroke(aStroke());
    expect(fire(keydown("z", { meta: true }))).toBe(true);
    expect(st().board.strokes).toHaveLength(0);
  });

  it("digit and mnemonic keys switch tools", () => {
    const cases: [string, string][] = [
      ["1", "select"],
      ["2", "pan"],
      ["3", "pen"],
      ["d", "pen"],
      ["4", "eraser"],
      ["e", "eraser"],
      ["5", "text"],
      ["t", "text"],
    ];
    for (const [key, tool] of cases) {
      st().setTool("select");
      if (tool === "select") st().setTool("pen");
      expect(fire(keydown(key)), `key ${key}`).toBe(true);
      expect(st().tool, `key ${key}`).toBe(tool);
    }
  });

  it("Delete only fires with a selection; Escape clears one", () => {
    st().addStroke(aStroke());
    expect(fire(keydown("Delete"))).toBe(false);

    st().selectAll();
    expect(fire(keydown("Escape"))).toBe(true);
    expect(st().selection.strokeIds).toEqual([]);

    st().selectAll();
    expect(fire(keydown("Delete"))).toBe(true);
    expect(st().board.strokes).toHaveLength(0);
  });

  it("Ctrl+A selects everything and switches to the select tool", () => {
    st().addStroke(aStroke());
    expect(fire(keydown("a", { ctrl: true }))).toBe(true);
    expect(st().tool).toBe("select");
    expect(st().selection.strokeIds).toHaveLength(1);
  });

  it("copy / paste / cut / duplicate drive the internal clipboard", () => {
    st().addStroke(aStroke());
    fire(keydown("a", { ctrl: true }));

    fire(keydown("c", { ctrl: true }));
    expect(fire(keydown("v", { ctrl: true }))).toBe(true);
    expect(st().board.strokes).toHaveLength(2);

    expect(fire(keydown("d", { ctrl: true }))).toBe(true); // duplicates the pasted clone
    expect(st().board.strokes).toHaveLength(3);

    expect(fire(keydown("x", { ctrl: true }))).toBe(true); // cut the selection
    expect(st().board.strokes).toHaveLength(2);
    expect(fire(keydown("v", { ctrl: true }))).toBe(true); // ...and paste it back
    expect(st().board.strokes).toHaveLength(3);
  });

  it("? and I reach the host's help / insert actions", () => {
    expect(fire(keydown("?"))).toBe(true);
    expect(fire(keydown("i"))).toBe(true);
    expect(fire(keydown("7"))).toBe(true); // picture (collab build)
    expect(hostCalls).toEqual(["openHelp", "openInsert", "openImage"]);
  });
});

describe("shapes, arrange & grouping", () => {
  it("shape keys switch to the draw tool in that mode; F is freehand", () => {
    const cases: [string, string][] = [
      ["l", "line"],
      ["a", "arrow"],
      ["r", "rect"],
      ["o", "ellipse"],
      ["y", "triangle"],
      ["n", "polygon"],
      ["q", "freepoly"],
      ["g", "angle"],
      ["f", "free"],
    ];
    for (const [key, mode] of cases) {
      st().setTool("select");
      expect(fire(keydown(key)), `key ${key}`).toBe(true);
      expect(st().tool, `key ${key}`).toBe("pen");
      expect(st().drawMode, `key ${key}`).toBe(mode);
    }
  });

  it("the draw key activates the tool first, then cycles the modes", () => {
    st().setTool("select");
    st().setDrawMode("free");
    expect(fire(keydown("3"))).toBe(true);
    expect(st().tool).toBe("pen");
    expect(st().drawMode).toBe("free"); // first press: no cycle
    expect(fire(keydown("3"))).toBe(true);
    expect(st().drawMode).toBe("highlighter"); // second press: next mode
    expect(fire(keydown("d"))).toBe(true);
    expect(st().drawMode).toBe("line"); // D shares the cycle
    // ... and the cycle wraps around the full mode list.
    for (let i = 0; i < 9; i++) fire(keydown("3"));
    expect(st().drawMode).toBe("free");
  });

  it("V and H are the industry-standard select / pan alternates", () => {
    st().setTool("pen");
    expect(fire(keydown("v"))).toBe(true);
    expect(st().tool).toBe("select");
    expect(fire(keydown("h"))).toBe(true);
    expect(st().tool).toBe("pan");
  });

  it("S toggles grid snapping", () => {
    expect(st().snap).toBe(true);
    expect(fire(keydown("s"))).toBe(true);
    expect(st().snap).toBe(false);
    fire(keydown("s"));
    expect(st().snap).toBe(true);
  });

  it("Ctrl+G groups, Ctrl+Shift+G ungroups", () => {
    freshBoard({ objects: [anObject(), anObject()] });
    st().selectAll();
    expect(fire(keydown("g", { ctrl: true }))).toBe(true);
    const gid = st().board.objects[0].groupId;
    expect(typeof gid).toBe("string");
    expect(st().board.objects[1].groupId).toBe(gid);

    expect(fire(keydown("g", { ctrl: true, shift: true }))).toBe(true);
    expect(st().board.objects[0].groupId).toBeUndefined();
  });

  it("the bracket combos arrange the selection (physical-key codes)", () => {
    const A = anObject();
    const B = anObject();
    freshBoard({ objects: [A, B] });
    st().select(A.id);
    const order = () => st().board.objects.map((o) => o.id);

    expect(
      fire(keydown("]", { ctrl: true, shift: true, code: "BracketRight" })),
    ).toBe(true); // bring to front
    expect(order()).toEqual([B.id, A.id]);

    expect(
      fire(keydown("[", { ctrl: true, shift: true, code: "BracketLeft" })),
    ).toBe(true); // send to back
    expect(order()).toEqual([A.id, B.id]);

    expect(fire(keydown("]", { ctrl: true, code: "BracketRight" }))).toBe(true);
    expect(order()).toEqual([B.id, A.id]); // forward one step

    expect(fire(keydown("[", { ctrl: true, code: "BracketLeft" }))).toBe(true);
    expect(order()).toEqual([A.id, B.id]); // backward one step
  });

  it("C also recolours a selected shape's border", () => {
    const s = {
      id: newId(),
      type: "shape",
      x: 0,
      y: 0,
      w: 100,
      h: 60,
      kind: "rect",
      nw: 100,
      nh: 60,
      pts: [],
      stroke: PALETTE[0][1],
      strokeWidth: 3,
      fill: "none",
      dash: false,
      showAngles: false,
      both: false,
    };
    freshBoard({ objects: [s] });
    st().setColor(PALETTE[0][1]);
    st().select(s.id);
    fire(keydown("c"));
    expect(st().board.objects[0].stroke).toBe(PALETTE[1][1]);
  });

  it("B cycles the background palette and recolours a selected shape's fill", () => {
    const s = {
      id: newId(),
      type: "shape",
      x: 0,
      y: 0,
      w: 100,
      h: 60,
      kind: "rect",
      nw: 100,
      nh: 60,
      pts: [],
      stroke: PALETTE[0][1],
      strokeWidth: 3,
      fill: FILL_PALETTE[0][1], // "none"
      dash: false,
      showAngles: false,
      both: false,
    };
    freshBoard({ objects: [s] });
    st().setFillColor(FILL_PALETTE[0][1]);
    st().select(s.id);
    expect(fire(keydown("b"))).toBe(true);
    expect(st().fillColor).toBe(FILL_PALETTE[1][1]);
    expect(st().board.objects[0].fill).toBe(FILL_PALETTE[1][1]);
  });
});

describe("colour cycling in laser mode", () => {
  it("C cycles the laser palette, leaving the draw colour untouched", () => {
    st().setTool("select");
    st().setLaserMode(true);
    const drawBefore = st().color;
    expect(fire(keydown("c"))).toBe(true);
    expect(st().laserColor).toBe(LASER_PALETTE[1][1]);
    expect(st().color).toBe(drawBefore);
  });
});

describe("arrow nudge", () => {
  it("a rapid burst is one undo step; a pause starts a new one", () => {
    vi.useFakeTimers();
    try {
      const s = aStroke();
      freshBoard({ strokes: [s] });
      st().setSelection({ objectIds: [], strokeIds: [s.id] });
      const minX = () =>
        Math.min(...st().board.strokes[0].points.map((p) => p.x));

      vi.advanceTimersByTime(1000); // ensure the first press opens a fresh step
      fire(keydown("ArrowRight"));
      vi.advanceTimersByTime(100);
      fire(keydown("ArrowRight"));
      vi.advanceTimersByTime(100);
      fire(keydown("ArrowRight"));
      expect(minX()).toBe(3);

      vi.advanceTimersByTime(600); // pause > 500ms
      fire(keydown("ArrowRight"));
      expect(minX()).toBe(4);

      st().undo(); // only the post-pause nudge
      expect(minX()).toBe(3);
      st().undo(); // the whole burst at once
      expect(minX()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Shift makes the step 10x", () => {
    const s = aStroke();
    freshBoard({ strokes: [s] });
    st().setSelection({ objectIds: [], strokeIds: [s.id] });

    fire(keydown("ArrowDown", { shift: true }));
    expect(st().board.strokes[0].points[0].y).toBe(10);
  });
});

describe("active-tool options", () => {
  it("+/- nudge the pen size within its range and clamp at the edges", () => {
    st().setTool("pen");
    st().setPenSize(PEN_SIZE_RANGE.max);
    expect(fire(keydown("+"))).toBe(true);
    expect(st().penSize).toBe(PEN_SIZE_RANGE.max); // clamped

    fire(keydown("-"));
    expect(st().penSize).toBe(PEN_SIZE_RANGE.max - PEN_SIZE_RANGE.step);

    st().setPenSize(6);
    fire(keydown("=")); // unshifted +/= key counts as +
    expect(st().penSize).toBe(6 + PEN_SIZE_RANGE.step);
  });

  it("resizing text re-measures the live text object's box", () => {
    const t = {
      id: newId(),
      type: "text",
      x: 0,
      y: 0,
      w: 40,
      h: 34,
      text: "hi",
      size: 26,
      color: PALETTE[0][1],
    };
    freshBoard({ objects: [t] });
    st().setTool("text");
    st().select(t.id);

    fire(keydown("+"));
    const obj = st().board.objects[0];
    expect(obj.size).toBe(28);
    expect(obj.h).toBeGreaterThan(34); // box tracked the bigger glyphs
  });

  it("C cycles the palette colour and recolours the active text object", () => {
    const t = {
      id: newId(),
      type: "text",
      x: 0,
      y: 0,
      w: 40,
      h: 34,
      text: "hi",
      size: 26,
      color: PALETTE[0][1],
    };
    freshBoard({ objects: [t] });
    st().setColor(PALETTE[0][1]);
    st().select(t.id);

    fire(keydown("c"));
    expect(st().color).toBe(PALETTE[1][1]);
    expect(st().board.objects[0].color).toBe(PALETTE[1][1]);
  });

  it("C recolours a selected pencil stroke, exactly like the pill swatch", () => {
    const s = aStroke({ color: PALETTE[0][1] });
    freshBoard({ strokes: [s] });
    st().setColor(PALETTE[0][1]);
    st().setSelection({ objectIds: [], strokeIds: [s.id] });

    fire(keydown("c"));
    expect(st().color).toBe(PALETTE[1][1]);
    expect(st().board.strokes[0].color).toBe(PALETTE[1][1]);
  });

  it("+/- in highlighter mode nudge the HIGHLIGHTER size, leaving the pen alone", () => {
    st().setTool("pen");
    st().setDrawMode("highlighter");

    fire(keydown("+"));
    expect(st().highlighterSize).toBe(20 + HIGHLIGHTER_SIZE_RANGE.step);
    expect(st().penSize).toBe(6); // untouched
  });

  it("+/- in a shape mode use the shape width range and restyle the selected shape", () => {
    const s = {
      id: newId(),
      type: "shape",
      x: 0,
      y: 0,
      w: 100,
      h: 60,
      kind: "rect",
      nw: 100,
      nh: 60,
      pts: [],
      stroke: PALETTE[0][1],
      strokeWidth: SHAPE_WIDTH_RANGE.max - 1,
      fill: "none",
      dash: false,
      showAngles: false,
      both: false,
    };
    freshBoard({ objects: [s] });
    st().setTool("pen");
    st().setDrawMode("rect");
    st().select(s.id);

    fire(keydown("+"));
    expect(st().board.objects[0].strokeWidth).toBe(SHAPE_WIDTH_RANGE.max);
    fire(keydown("+")); // clamped at the SHAPE range, not the pen's wider one
    expect(st().board.objects[0].strokeWidth).toBe(SHAPE_WIDTH_RANGE.max);
  });

  it("+/- restyle the selected pencil stroke in a freehand edit session", () => {
    const s = aStroke({ size: 6 });
    freshBoard({ strokes: [s] });
    st().setTool("pen");
    st().setDrawMode("free");
    st().setSelection({ objectIds: [], strokeIds: [s.id] });

    fire(keydown("+"));
    expect(st().board.strokes[0].size).toBe(6 + PEN_SIZE_RANGE.step);
    expect(st().penSize).toBe(6 + PEN_SIZE_RANGE.step); // default follows too
  });

  it("+/- resize a selected maths object from ITS current size, not the default", () => {
    // natW/natH 200x60 resized to 2x (w=400) -> its derived size is 52, so a
    // "+" lands on 54 — never 28 (the untouched default would give that).
    const m = {
      id: newId(),
      type: "mathtext",
      x: 0,
      y: 0,
      w: 400,
      h: 120,
      latex: "1+1",
      natW: 200,
      natH: 60,
      color: PALETTE[0][1],
    };
    freshBoard({ objects: [m] });
    st().setTool("math");
    st().select(m.id);

    fire(keydown("+"));
    expect(st().board.objects[0].w).toBeCloseTo((200 * 54) / 26, 3);
    expect(st().mathSize).toBe(54);
  });
});

describe("catalog invariants (the help page's single source of truth)", () => {
  it("every entry has a unique id, at least one key combo, and a label", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(s.keys.length, s.id).toBeGreaterThan(0);
      expect(s.keys.every((combo) => combo.length > 0), s.id).toBe(true);
      expect(s.label, s.id).not.toBe("");
    }
  });

  it("keyHint derives tooltip hints from the catalog", () => {
    expect(keyHint("tool-draw")).toBe("3 / D");
    expect(keyHint("saveAs")).toBe("Ctrl+Shift+S");
    expect(keyHint("does-not-exist")).toBe("");
  });

  it("the grouped help view covers the whole catalog with no empty groups", () => {
    const groups = shortcutsByGroup();
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(SHORTCUTS.length);
  });
});
