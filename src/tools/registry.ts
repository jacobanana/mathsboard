// THE TOOL CONTRACT.
//
// Every maths widget is a Tool registered here. A Tool is either:
//   - a CanvasTool: drawn directly onto the board canvas via draw(kit, obj).
//   - a WidgetTool: rendered as an interactive React component overlaid on the
//     board (e.g. the type-and-check worksheet); reads/updates via the store.
//
// Tool authors copy src/tools/numberline (canvas + dialog) or src/tools/text
// (canvas, no dialog) as templates. They DO NOT register globally themselves --
// the Assembly phase owns src/tools/index.ts and calls registerTool for each.

import type React from "react";
import type { Theme } from "@/styles/theme";
import type { BoardObjectBase, ToolName } from "@/board/types";
import type { DrawMode } from "@/board/store";

// --- gallery taxonomy -----------------------------------------------------

export type ToolCategory =
  | "number"
  | "practice"
  | "fractions"
  | "geometry"
  | "time"
  | "word"
  | "media";

/** Display order of category sections in the Insert gallery. */
export const CATEGORY_ORDER: ToolCategory[] = [
  "number",
  "practice",
  "fractions",
  "geometry",
  "time",
  "word",
  "media",
];

/** Section headings, matching the prototype gallery exactly. */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  number: "Number & calculating",
  practice: "Practice — type & check",
  fractions: "Fractions, decimals & %",
  geometry: "Geometry",
  time: "Time",
  word: "Word problems",
  media: "Pictures",
};

// --- draw + dialog contracts ----------------------------------------------

/** Everything a canvas draw() needs. The camera transform is already applied. */
export interface DrawKit {
  ctx: CanvasRenderingContext2D;
  theme: Theme;
  font: string;
  /**
   * The uniform box-resize scale already baked into the ctx transform (the
   * object's box divided by its natural size; 1 at natural size). A tool that
   * wants a part to keep a constant on-canvas size despite resize — e.g. a
   * shape's border thickness — divides that measurement by this scale.
   */
  scale: number;
}

/**
 * Props every tool Dialog receives.
 *   initial   present  -> EDIT an existing object; buttons read "Save"/"Cancel".
 *             absent   -> CREATE a new object;     buttons read "Add to board"/"Back".
 *   onSubmit(params)   -> validated params; host places (create) or updates (edit).
 *   onCancel()         -> close without changes (edit) / return to gallery (create).
 */
export interface ToolDialogProps<P> {
  initial?: P;
  onSubmit: (params: P) => void;
  onCancel: () => void;
}

/** Shared metadata for both kinds of tool. */
export interface ToolMeta {
  type: string;
  name: string;
  blurb: string;
  category: ToolCategory;
  /** Show in the Insert gallery? Defaults to true; set false for e.g. free text. */
  inGallery?: boolean;
  /**
   * Does this tool have a revealable worked answer? When true, the board shows
   * a systemic "show answer" toggle at the object's top-left (AnswerButtonLayer)
   * and the tool's draw() reads the object's `revealed` flag to show or hide it.
   * Replaces the old per-tool create-time "Fill in the answers" checkbox: the
   * answer is now revealed live, not baked in at creation. Omit for tools with
   * nothing to reveal.
   */
  answer?: boolean;
}

/**
 * Optional VERTEX-EDITING capability for parametric canvas tools (the shape
 * tool's draggable triangle corners, line endpoints, Bézier control points).
 * The select controller renders and drives these generically: it draws a
 * round handle at each point `get` returns, and a drag on one applies the
 * patch `move` computes — so a new parametric tool gets interactive vertices
 * with zero controller edits.
 */
export interface VertexCapability<P> {
  /** World-space position of every editable vertex, in a stable order. */
  get(obj: BoardObjectBase & P): { x: number; y: number }[];
  /**
   * Object patch for dragging vertex `i` to world point (wx, wy). `opts`
   * carries the active snapping intents (Alt bypasses both): `gridSnap` when
   * grid snapping applies, `angleSnap` for the tool's own magnetic angle
   * values (right angles, 15° multiples) — the tool decides which wins.
   */
  move(
    obj: BoardObjectBase & P,
    i: number,
    wx: number,
    wy: number,
    opts?: { gridSnap?: boolean; angleSnap?: boolean },
  ): Record<string, unknown>;
  /** True when the vertices REPLACE the box resize handles (line-like shapes
   *  whose points are their whole geometry). Default: both are shown. */
  replacesResize?(obj: BoardObjectBase & P): boolean;
  /** Light guide segments drawn with the handles (Bézier control arms). */
  guides?(
    obj: BoardObjectBase & P,
  ): [{ x: number; y: number }, { x: number; y: number }][];
  /**
   * Optional POINT INSERTION: world positions for "add a point" handles, one
   * per insertable segment/edge, in a stable order. The select controller
   * draws these as small hollow handles; pressing one calls `insert` and
   * hands the fresh vertex straight to a drag.
   */
  midpoints?(obj: BoardObjectBase & P): { x: number; y: number }[];
  /** Insert a vertex on segment `seg` at world (wx, wy). Returns the object
   *  patch plus the new vertex's index (for the follow-on drag), or null when
   *  the segment can't take a point. */
  insert?(
    obj: BoardObjectBase & P,
    seg: number,
    wx: number,
    wy: number,
  ): { patch: Record<string, unknown>; index: number } | null;
  /** Patch that removes vertex `i` (double-click), or null when the shape is
   *  already at its minimum point count. */
  remove?(obj: BoardObjectBase & P, i: number): Record<string, unknown> | null;
  /**
   * Insert a vertex ON the shape's drawn path nearest to world (wx, wy),
   * within `tol` world px — the CAD "double-click the line to add a point"
   * gesture. Returns the patch plus the new vertex's index, or null when the
   * click wasn't on the path (or the tool doesn't support it for this kind).
   */
  insertOnPath?(
    obj: BoardObjectBase & P,
    wx: number,
    wy: number,
    tol: number,
  ): { patch: Record<string, unknown>; index: number } | null;
  /**
   * BÉZIER ARMS: the draggable tangent handles shown when vertex `i` is
   * focused (clicked once) — world positions plus which side of the vertex
   * each sits on. Empty/omitted = no arms for this vertex.
   */
  arms?(
    obj: BoardObjectBase & P,
    i: number,
  ): { x: number; y: number; side: 1 | -1 }[];
  /** Patch for dragging vertex `i`'s arm on `side` to world (wx, wy). */
  moveArm?(
    obj: BoardObjectBase & P,
    i: number,
    side: 1 | -1,
    wx: number,
    wy: number,
  ): Record<string, unknown>;
}

/**
 * Optional TYPE-IN INPUTS for a canvas tool: HTML <input> boxes overlaid on the
 * object (InputOverlayLayer) so pupils can type answers into e.g. a times-table
 * or grid-method cell. The tool stays a CanvasTool — it keeps resize, z-order
 * and draw-over — and just declares WHERE the boxes go; the overlay owns the DOM
 * inputs, stores typed values on the object as live widget state ("ans:<key>":
 * synced, persisted and undo-invisible, exactly like the worksheet), and marks
 * them against `correct`. draw() must NOT paint the value a field covers — the
 * input shows it.
 */
export interface InputFieldSpec {
  /** Stable id; the typed value is stored as the object field "ans:<key>". */
  key: string;
  /** Box in the tool's NATURAL coords (the object-relative space draw() uses). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Expected answer for live marking; omit for un-marked free entry. */
  correct?: number;
  /**
   * Expected WRITTEN answer (a number in words) for marking via wordsMatch
   * instead of the numeric answersMatch — e.g. "type this number in words".
   * Mutually exclusive with `correct`; used with variant "text".
   */
  correctText?: string;
  /**
   * Visual style. "box" (default): the input is its own framed field (the tool
   * draws no cell under it) — e.g. a single practice table. "cell": frameless,
   * fills a cell the tool already draws grid lines for — e.g. the 12×12 grid,
   * where a per-cell border would double the gridlines. "text": a wide, left-
   * aligned free-text field (not numeric), graded against `correctText`.
   */
  variant?: "box" | "cell" | "text";
}

export interface InputCapability<P> {
  fields(obj: BoardObjectBase & P): InputFieldSpec[];
}

/**
 * Optional LIVE STYLING capability: how one styleable property (a "channel")
 * reads from and writes to an object of this type — including any box
 * re-measure the change demands (text re-wraps, maths re-derives its scaled
 * box). The styling service (board/styling.ts) drives these so the options
 * pill and the keyboard shortcuts restyle an edit target IDENTICALLY; a tool
 * without a channel simply isn't restyled by that control.
 */
export interface StyleChannel<P, V> {
  /** The object's current value for this channel. */
  get(obj: BoardObjectBase & P): V;
  /** Object patch applying `v` (may re-derive w/h alongside). */
  patch(obj: BoardObjectBase & P, v: V): Record<string, unknown>;
}

export interface ToolStyling<P> {
  /** Ink colour (a text/maths colour, a shape's border). */
  color?: StyleChannel<P, string>;
  /** Background fill ("none" = transparent; closed shapes). */
  fill?: StyleChannel<P, string>;
  /** The tool's size notion (font px, border width, ...). */
  size?: StyleChannel<P, number>;
  /** Horizontal text alignment. */
  align?: StyleChannel<P, "left" | "center" | "right">;
}

/**
 * Optional EDIT ROUTING: what "edit this object with its own tool" means for
 * this type. The select/pan controllers resolve a double-click through this
 * (canvas/interactions/select.ts editObjectAt) instead of switching on type
 * names — a new editable type declares its route here. Absent = the type's
 * settings Dialog (the App-hosted EDIT modal).
 */
export interface EditRoute {
  /** The interaction tool that edits this type (it stays selected there). */
  tool: ToolName;
  /** Draw-tool sub-mode to arm first (a shape edits in its own kind). */
  drawMode?: DrawMode;
  /** Open the type's registered in-place editor (canvas/editors.ts). */
  inPlace?: boolean;
  /** Mark a draw-tool edit session — "double-click again to exit". */
  editSession?: boolean;
}

/**
 * Whether a typed answer matches the expected value, for input marking. Rounds
 * both to 6dp so float noise and clean decimals (0.75, 33.333333) compare
 * equal; non-numeric input never matches.
 */
export function answersMatch(typed: string, correct: number): boolean {
  if (typed.trim() === "") return false; // blank never matches (even correct 0)
  const n = Number(typed);
  if (!Number.isFinite(n)) return false;
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return r(n) === r(correct);
}

/** A tool drawn onto the board canvas. */
export interface CanvasTool<P = Record<string, unknown>> extends ToolMeta {
  kind: "canvas";
  /** Initial params for a freshly created object. */
  defaults: () => P;
  /** Bounding-box size for given params. */
  size: (p: P) => { w: number; h: number };
  /** Render the object. ctx is already camera-transformed (world space). */
  draw: (kit: DrawKit, obj: BoardObjectBase & P) => void;
  /** Optional settings dialog. Omit for click-to-place tools (e.g. text). */
  Dialog?: React.FC<ToolDialogProps<P>>;
  /** Optional type-in answer boxes overlaid on the object (see InputCapability). */
  inputs?: InputCapability<P>;
  /** Optional draggable-vertex editing (see VertexCapability). */
  vertices?: VertexCapability<P>;
  /** Optional live styling channels (see ToolStyling). */
  styling?: ToolStyling<P>;
  /** Optional edit routing — "edit with its own tool" (see EditRoute). */
  editWith?: (obj: BoardObjectBase & P) => EditRoute;
  /**
   * Optional ROTATION: the patch that turns the object by `degrees` around
   * its box centre. Tools that support it get the select controller's rotate
   * handle and the selection's rotate buttons; how the turn is stored (baked
   * into points, a rotation param, ...) is the tool's business.
   */
  rotate?: (obj: BoardObjectBase & P, degrees: number) => Record<string, unknown>;
}

/** Props an interactive widget component receives. */
export interface WidgetProps<P> {
  // The widget reads/updates its object via the store directly (useBoardStore).
  obj: BoardObjectBase & P;
  /**
   * Open this widget's settings Dialog (EDIT flow). Provided by the host via
   * the WidgetLayer, mirroring BoardCanvas's onEditObject for canvas objects.
   * Routes through the same App modal/edit pipeline as the toolbar/double-click.
   */
  onEdit?: () => void;
}

/** A tool rendered as an interactive React overlay. */
export interface WidgetTool<P = Record<string, unknown>> extends ToolMeta {
  kind: "widget";
  defaults: () => P;
  defaultSize: { w: number; h: number };
  Component: React.FC<WidgetProps<P>>;
  Dialog?: React.FC<ToolDialogProps<P>>;
  /**
   * Opt in to box resizing. Widgets are HTML overlays, so their resize handles
   * can't be painted on the canvas (they'd sit under the widget) — the
   * WidgetHandleLayer floats DOM handles over the selected widget instead. Only
   * set this when the Component fully derives its layout from `obj.w`/`obj.h`
   * (like the die): a widget that self-measures its natural size (the worksheet)
   * would just snap back and must NOT opt in. The box keeps its aspect ratio
   * unless the tool also sets `freeAspect`.
   */
  resizable?: boolean;
  /**
   * Opt OUT of aspect-ratio locking while resizing (requires `resizable`). A
   * widget whose HTML layout reflows to fill any box — the number-order game's
   * tile grid — can be stretched freely on either axis; each handle moves its
   * own edge and the other axis is left alone. Editing settings then preserves
   * the object's current w/h instead of snapping it back to the natural ratio.
   * Omit for widgets that only look right at a fixed shape (the die, the flip
   * card), which stay aspect-locked.
   */
  freeAspect?: boolean;
  /**
   * Optional LIVE-STATE reset after a settings edit is applied. When present,
   * editObject writes the returned patch via updateWidgetState (INPUT_ORIGIN,
   * undo-invisible) right after the param edit — the timer uses this to reset its
   * run whenever its settings change. Return null to leave the run untouched.
   */
  resetOnEdit?(obj: BoardObjectBase & P): Record<string, unknown> | null;
}

export type Tool = CanvasTool<any> | WidgetTool<any>;

// Identity helpers that give tool authors full type inference on P.
export function defineCanvasTool<P>(t: CanvasTool<P>): CanvasTool<P> {
  return t;
}
export function defineWidgetTool<P>(t: WidgetTool<P>): WidgetTool<P> {
  return t;
}

// --- the registry ---------------------------------------------------------

const REGISTRY = new Map<string, Tool>();

/** Register a tool by its `type`. Throws on duplicate type. */
export function registerTool(t: Tool): void {
  if (REGISTRY.has(t.type)) {
    throw new Error(`Tool type "${t.type}" is already registered.`);
  }
  REGISTRY.set(t.type, t);
}

export function getTool(type: string): Tool | undefined {
  return REGISTRY.get(type);
}

export function listTools(): Tool[] {
  return [...REGISTRY.values()];
}

/** Gallery-visible tools for a category, in registration order. */
export function listByCategory(category: ToolCategory): Tool[] {
  return listTools().filter(
    (t) => t.category === category && t.inGallery !== false,
  );
}
