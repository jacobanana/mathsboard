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
import type { BoardObjectBase } from "@/board/types";

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
  /** Optional draggable-vertex editing (see VertexCapability). */
  vertices?: VertexCapability<P>;
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
