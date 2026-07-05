// The styling service: ONE pipeline for "set the drawing default and restyle
// the live edit target through its type's own rule". The options pill and the
// keyboard shortcuts both sit on these functions, so this suite pins the
// behaviour they share: which single thing is the edit target, which size
// binding a tool/mode resolves to, and what applying a style actually writes.

import { beforeEach, describe, expect, it } from "vitest";
import "@/tools";
import {
  activeEditTarget,
  applyStyle,
  sizeBinding,
  sizeValue,
  styleValue,
} from "@/board/styling";
import { useBoardStore } from "@/board/store";
import { id as newId } from "@/board/types";
import { PALETTE, SHAPE_WIDTH_RANGE } from "@/ui/constants";
import { anObject, aStroke, freshBoard } from "@/testing/fixtures";
import type { AnyBoardObject } from "@/board/types";

const st = () => useBoardStore.getState();

const aText = (over: Partial<AnyBoardObject> = {}): AnyBoardObject => ({
  id: newId(),
  type: "text",
  x: 0,
  y: 0,
  w: 40,
  h: 34,
  text: "hi",
  size: 26,
  color: PALETTE[0][1],
  ...over,
});

const aShape = (over: Partial<AnyBoardObject> = {}): AnyBoardObject => ({
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
  ...over,
});

beforeEach(() => {
  freshBoard();
});

describe("activeEditTarget", () => {
  it("is the single selected object or stroke; multi-selects and erasers don't count", () => {
    const T = aText();
    const S = aStroke();
    const E = aStroke({ mode: "eraser" });
    freshBoard({ objects: [T], strokes: [S, E] });

    st().select(T.id);
    expect(activeEditTarget(st())).toEqual({
      kind: "object",
      id: T.id,
      type: "text",
    });

    st().setSelection({ objectIds: [], strokeIds: [S.id] });
    expect(activeEditTarget(st())).toEqual({
      kind: "stroke",
      id: S.id,
      type: "pen",
    });

    st().setSelection({ objectIds: [T.id], strokeIds: [S.id] });
    expect(activeEditTarget(st())).toBeNull(); // multi

    st().setSelection({ objectIds: [], strokeIds: [E.id] });
    expect(activeEditTarget(st())).toBeNull(); // eraser strokes aren't styleable
  });

  it("an open in-place editor wins over the selection", () => {
    const T = aText();
    freshBoard({ objects: [T] });
    st().clearSelection();
    st().setEditingId(T.id);
    expect(activeEditTarget(st())?.id).toBe(T.id);
  });
});

describe("sizeBinding", () => {
  it("resolves the pill/shortcut binding per tool and pen sub-mode", () => {
    st().setTool("pen");
    st().setDrawMode("free");
    expect(sizeBinding(st())).toMatchObject({ channel: "pen", appliesTo: "stroke" });

    st().setDrawMode("highlighter");
    expect(sizeBinding(st())).toMatchObject({
      channel: "highlighter",
      appliesTo: "stroke",
    });

    st().setDrawMode("rect");
    expect(sizeBinding(st())).toMatchObject({
      channel: "pen",
      range: SHAPE_WIDTH_RANGE,
      appliesTo: "shape",
    });

    st().setTool("select");
    expect(sizeBinding(st())).toBeNull(); // the pointer has no size
  });
});

describe("sizeValue", () => {
  it("shows the edit target's own size when it falls under the binding", () => {
    const S = aStroke({ size: 14 });
    freshBoard({ strokes: [S] });
    st().setTool("pen");
    st().setDrawMode("free");
    st().setSelection({ objectIds: [], strokeIds: [S.id] });
    expect(sizeValue(st())).toBe(14);
  });

  it("clamps the pen default into the shape-width band in shape modes", () => {
    st().setTool("pen");
    st().setSize("pen", 24); // fatter than any shape border
    st().setDrawMode("rect");
    expect(sizeValue(st())).toBe(SHAPE_WIDTH_RANGE.max);
  });
});

describe("applyStyle", () => {
  it("colour: sets the default and recolours any styleable target, whatever the tool", () => {
    const Sh = aShape();
    freshBoard({ objects: [Sh] });
    st().setTool("text"); // colour applies across tools (long-standing swatch rule)
    st().select(Sh.id);

    applyStyle("color", PALETTE[3][1]);
    expect(st().color).toBe(PALETTE[3][1]);
    expect(st().board.objects[0].stroke).toBe(PALETTE[3][1]); // the shape's "colour" is its border
  });

  it("colour: leaves a target alone when its type has no colour channel", () => {
    const O = anObject(); // numberline: no styling capability
    freshBoard({ objects: [O] });
    st().select(O.id);
    const before = st().board.objects[0];

    applyStyle("color", PALETTE[3][1]);
    expect(st().color).toBe(PALETTE[3][1]); // default still moves
    expect(st().board.objects[0]).toEqual(before); // object untouched
  });

  it("size: re-measures a text target's box through the tool's own rule", () => {
    const T = aText();
    freshBoard({ objects: [T] });
    st().setTool("text");
    st().select(T.id);

    applyStyle("size", 40);
    const obj = st().board.objects[0];
    expect(obj.size).toBe(40);
    expect(obj.h).toBeGreaterThan(34); // box tracked the bigger glyphs
    expect(st().sizes.text).toBe(40); // default follows
  });

  it("size: only restyles targets inside the active binding's domain", () => {
    const Sh = aShape({ strokeWidth: 3 });
    freshBoard({ objects: [Sh] });
    st().setTool("text"); // text binding: a selected SHAPE is out of domain
    st().select(Sh.id);

    applyStyle("size", 40);
    expect(st().sizes.text).toBe(40); // the text default moved...
    expect(st().board.objects[0].strokeWidth).toBe(3); // ...the shape didn't
  });

  it("fill and align route to the types that expose them", () => {
    const Sh = aShape();
    const T = aText();
    freshBoard({ objects: [Sh, T] });

    st().select(Sh.id);
    applyStyle("fill", "#C8E6D3");
    expect(st().board.objects[0].fill).toBe("#C8E6D3");
    expect(st().fillColor).toBe("#C8E6D3");

    st().select(T.id);
    applyStyle("align", "center");
    expect(st().board.objects[1].align).toBe("center");
    expect(st().textAlign).toBe("center");
    expect(styleValue(st(), "align")).toBe("center");
  });
});
