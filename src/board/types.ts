// Core data model for the board.
//
// Two kinds of state, kept deliberately separate (see store.ts):
//   - DOCUMENT state (BoardDocument): the unit that will sync to a backend /
//     collaborators later. Every object & stroke has a stable string `id`.
//   - EPHEMERAL state (camera, tool, colour, selection): local-only, never synced.

/** Every placed object shares this geometric base. */
export interface BoardObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A concrete object on the board. Tool-specific params live alongside the base
 * fields as extra keys (e.g. a numberline carries start/step/intervals/hide).
 * Tools narrow this to `BoardObjectBase & P` in their draw/Component signatures.
 */
export type AnyBoardObject = BoardObjectBase & Record<string, unknown>;

/** A freehand pen / eraser stroke. Points are in world coordinates. */
export interface Stroke {
  id: string;
  mode: "pen" | "eraser";
  color: string;
  size: number;
  points: { x: number; y: number }[];
  /**
   * Z-order key (see src/collab/docModel.ts). Shapes live in unordered CRDT
   * maps, so draw order is derived by sorting on this field. Objects carry the
   * same key via their open Record type. Optional for legacy documents.
   */
  order?: number;
}

export type Background = "squared" | "lined" | "blank";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export type ToolName = "pen" | "text" | "eraser" | "select" | "pan";

/** The syncable document. This is what a BoardRepository persists. */
export interface BoardDocument {
  id: string;
  name: string;
  background: Background;
  objects: AnyBoardObject[];
  strokes: Stroke[];
  createdAt: number;
  updatedAt: number;
}

/** Lightweight listing entry (no objects/strokes), for the boards gallery. */
export interface BoardSummary {
  id: string;
  name: string;
  updatedAt: number;
}

/**
 * The continuously-autosaved working copy ("draft"). It wraps a full document
 * with a pointer to the named library board it was opened from (`sourceId`, null
 * for a never-saved board) and whether it has changed since the last explicit
 * save (`dirty`). Persisted so an interrupted session resumes exactly; an
 * explicit Save/Save-as is what writes the document back into the library.
 */
export interface DraftEnvelope {
  doc: BoardDocument;
  sourceId: string | null;
  dirty: boolean;
}

/** Stable id generator for every object, stroke, and document. */
export const id = (): string => crypto.randomUUID();

/** Default name for a board that has never been explicitly saved. */
export const UNTITLED_NAME = "Untitled board";

/** Build a blank, in-memory board document. Does NOT persist it anywhere. */
export function newBoardDocument(name: string = UNTITLED_NAME): BoardDocument {
  const now = Date.now();
  return {
    id: id(),
    name,
    background: "squared",
    objects: [],
    strokes: [],
    createdAt: now,
    updatedAt: now,
  };
}
