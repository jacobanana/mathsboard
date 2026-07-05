// THE STYLING SERVICE (R2 in docs/tool-architecture-refactor.md).
//
// Both surfaces that restyle things live — the options pill and the keyboard
// shortcuts (colour cycle, +/-) — do the same two-part move: set the DRAWING
// DEFAULT for a property, and patch the current EDIT TARGET through its
// type's own rule (a text resize re-measures the box, a maths resize
// re-derives the scaled box, a shape recolour hits `stroke`, ...). This
// module is that move, written once:
//
//   activeEditTarget  -> THE single object/stroke being styled (replaces the
//                        old per-type active*Id selectors);
//   sizeBinding       -> which size channel / range / target type the active
//                        tool+mode binds to (the pill's slider = the +/- keys);
//   styleValue        -> what a control should display (target ?? default);
//   applyStyle        -> set the default AND restyle the target.
//
// The per-type rules are NOT here: canvas tools declare StyleChannels in
// their registry entry (tools/registry.ts `styling`); strokes get a built-in
// pair below. A type without a channel simply isn't restyled by that control.

import { useBoardStore } from "@/board/store";
import { getTool } from "@/tools/registry";
import type { StyleChannel } from "@/tools/registry";
import {
  SIZE_CHANNELS,
  SHAPE_WIDTH_RANGE,
  PEN_SIZE_RANGE,
  HIGHLIGHTER_SIZE_RANGE,
} from "@/ui/constants";
import type { SizeChannelId, SizeRange } from "@/ui/constants";
import type { Stroke } from "@/board/types";

type BoardState = ReturnType<typeof useBoardStore.getState>;

export type StyleChannelId = "color" | "fill" | "size" | "align";
export type TextAlign = "left" | "center" | "right";

// --- the edit target --------------------------------------------------------

export interface EditTarget {
  kind: "object" | "stroke";
  id: string;
  /** The object's tool type, or the stroke's mode ("pen" / "highlighter"). */
  type: string;
}

/**
 * The single object or stroke the pill / shortcuts are editing live, or null.
 * An open in-place editor wins over the selection; otherwise only a
 * single-item selection qualifies (never a multi-select, never an eraser
 * stroke). One selector, shared by every styling surface, so "which thing
 * updates live" can't diverge between them.
 */
export function activeEditTarget(
  s: Pick<BoardState, "editingId" | "selection" | "board">,
): EditTarget | null {
  if (s.editingId != null) {
    const o = s.board.objects.find((x) => x.id === s.editingId);
    return o ? { kind: "object", id: o.id, type: o.type } : null;
  }
  const { objectIds, strokeIds } = s.selection;
  if (objectIds.length === 1 && strokeIds.length === 0) {
    const o = s.board.objects.find((x) => x.id === objectIds[0]);
    return o ? { kind: "object", id: o.id, type: o.type } : null;
  }
  if (strokeIds.length === 1 && objectIds.length === 0) {
    const stroke = s.board.strokes.find((x) => x.id === strokeIds[0]);
    return stroke && stroke.mode !== "eraser"
      ? { kind: "stroke", id: stroke.id, type: stroke.mode }
      : null;
  }
  return null;
}

// --- channel resolution -------------------------------------------------------

/** Strokes aren't registry tools; their two styleable channels live here. */
const STROKE_CHANNELS: {
  [C in StyleChannelId]?: {
    get(s: Stroke): string | number;
    patch(s: Stroke, v: string | number): Partial<Stroke>;
  };
} = {
  color: {
    get: (s) => s.color,
    patch: (_s, color) => ({ color: color as string }),
  },
  size: {
    get: (s) => s.size,
    patch: (_s, size) => ({ size: size as number }),
  },
};

/** A target's channel, normalised to read/apply closures — object channels
 *  come from the tool's registry `styling`, stroke channels from the table
 *  above. Null when the target's type doesn't expose the channel. */
function resolveChannel(
  s: Pick<BoardState, "board">,
  target: EditTarget,
  channel: StyleChannelId,
): {
  value(): string | number;
  apply(st: BoardState, v: string | number): void;
} | null {
  if (target.kind === "stroke") {
    const stroke = s.board.strokes.find((x) => x.id === target.id);
    const ch = STROKE_CHANNELS[channel];
    if (!stroke || !ch) return null;
    return {
      value: () => ch.get(stroke),
      apply: (st, v) => st.updateStroke(stroke.id, ch.patch(stroke, v)),
    };
  }
  const obj = s.board.objects.find((x) => x.id === target.id);
  if (!obj) return null;
  const t = getTool(obj.type);
  const raw = t && t.kind === "canvas" ? t.styling?.[channel] : undefined;
  if (!raw) return null;
  // Tools declare channels against their own P; here we only have the open
  // object record, so widen once at the seam.
  const ch = raw as unknown as StyleChannel<
    Record<string, unknown>,
    string | number
  >;
  return {
    value: () => ch.get(obj),
    apply: (st, v) => st.updateObject(obj.id, ch.patch(obj, v)),
  };
}

// --- size binding -------------------------------------------------------------

/**
 * What the active tool/mode's size control operates on: the store channel it
 * defaults to, the range it moves in, and which target type it restyles
 * (null = defaults only, e.g. the eraser). One table — the pill's slider and
 * the +/- shortcut read the SAME binding, so they can't disagree. Tools
 * without a size (select, pan) bind to nothing.
 */
export interface SizeBinding {
  channel: SizeChannelId;
  range: SizeRange;
  /** "stroke", or an object type ("text" / "mathtext" / "shape"); null = none. */
  appliesTo: string | null;
}

export function sizeBinding(
  s: Pick<BoardState, "tool" | "drawMode">,
): SizeBinding | null {
  switch (s.tool) {
    case "pen":
      if (s.drawMode === "free")
        return { channel: "pen", range: PEN_SIZE_RANGE, appliesTo: "stroke" };
      if (s.drawMode === "highlighter")
        return {
          channel: "highlighter",
          range: HIGHLIGHTER_SIZE_RANGE,
          appliesTo: "stroke",
        };
      // Shape modes: the border width follows the pen's default but moves in
      // the narrower shape range.
      return { channel: "pen", range: SHAPE_WIDTH_RANGE, appliesTo: "shape" };
    case "text":
      return {
        channel: "text",
        range: SIZE_CHANNELS.text.range,
        appliesTo: "text",
      };
    case "math":
      return {
        channel: "math",
        range: SIZE_CHANNELS.math.range,
        appliesTo: "mathtext",
      };
    case "eraser":
      return {
        channel: "eraser",
        range: SIZE_CHANNELS.eraser.range,
        appliesTo: null,
      };
    default:
      return null;
  }
}

/** Does the current edit target fall under the binding's styling domain? */
function targetMatches(target: EditTarget, appliesTo: string | null): boolean {
  if (appliesTo == null) return false;
  return appliesTo === "stroke"
    ? target.kind === "stroke"
    : target.kind === "object" && target.type === appliesTo;
}

// --- what a control displays ----------------------------------------------------

type StyleState = Pick<
  BoardState,
  | "board"
  | "selection"
  | "editingId"
  | "tool"
  | "drawMode"
  | "sizes"
  | "color"
  | "fillColor"
  | "textAlign"
>;

/** The size the active tool's slider / +/- keys should show: the edit
 *  target's own value when it falls under the binding, else the channel
 *  default (clamped into the binding's range — the pen default can exceed the
 *  shape-width band). Null when the tool has no size at all. */
export function sizeValue(s: StyleState): number | null {
  const b = sizeBinding(s);
  if (!b) return null;
  const target = activeEditTarget(s);
  if (target && targetMatches(target, b.appliesTo)) {
    const r = resolveChannel(s, target, "size");
    if (r) return r.value() as number;
  }
  return Math.min(s.sizes[b.channel], b.range.max);
}

/** What a colour/fill/align control displays: the edit target's own value if
 *  its type exposes the channel, else the drawing default. */
export function styleValue(
  s: StyleState,
  channel: "color" | "fill" | "align",
): string {
  const target = activeEditTarget(s);
  if (target) {
    const r = resolveChannel(s, target, channel);
    if (r) return r.value() as string;
  }
  return channel === "color"
    ? s.color
    : channel === "fill"
      ? s.fillColor
      : s.textAlign;
}

// --- applying a style --------------------------------------------------------

/** Patch the edit target through its channel (object or stroke), if any. */
function patchTarget(
  st: BoardState,
  target: EditTarget | null,
  channel: StyleChannelId,
  value: string | number,
): void {
  if (!target) return;
  resolveChannel(st, target, channel)?.apply(st, value);
}

/**
 * THE one styling pipeline: set the drawing default for `channel` and restyle
 * the live edit target through its type's own rule. For "size" the default
 * lands in the channel the active tool binds to (sizeBinding), and only a
 * target inside that binding's domain is patched — matching what the slider
 * visibly edits. For "color" / "fill" / "align" any single styleable target
 * is patched, whatever tool is active (the long-standing swatch behaviour).
 */
export function applyStyle(
  channel: StyleChannelId,
  value: string | number,
): void {
  const st = useBoardStore.getState();
  const target = activeEditTarget(st);

  if (channel === "size") {
    const b = sizeBinding(st);
    if (!b) return;
    st.setSize(b.channel, value as number);
    if (target && targetMatches(target, b.appliesTo)) {
      patchTarget(st, target, "size", value);
    }
    return;
  }

  if (channel === "color") st.setColor(value as string);
  else if (channel === "fill") st.setFillColor(value as string);
  else st.setTextAlign(value as TextAlign);
  patchTarget(st, target, channel, value);
}
