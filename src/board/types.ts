// Core data model for the board.
//
// Two kinds of state, kept deliberately separate (see store.ts):
//   - DOCUMENT state (BoardDocument): the unit that will sync to a backend /
//     collaborators later. Every object & stroke has a stable string `id`.
//   - EPHEMERAL state (camera, tool, colour, selection): local-only, never synced.

// The active board profile supplies the starting paper for a new document. The
// import is runtime-safe (boardProfile only imports this module for TYPES, which
// are erased) so there is no evaluation cycle.
import { PROFILE } from "@/boardProfile";
import type { Subject } from "@/subject";
import type { ContentPack } from "@/lang/content/schema";

/** Every placed object shares this geometric base. */
export interface BoardObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * SYSTEMIC ANSWER REVEAL. Meaningful only for tools that opt in with
   * `answer: true` (see registry.ts): when true the tool's draw() shows the
   * worked answer, when falsy it stays hidden. Toggled at runtime by the
   * board's reveal button (store.toggleAnswer -> INPUT_ORIGIN), NOT set from a
   * tool dialog — so it syncs to collaborators and persists, but Ctrl+Z never
   * flips it. Absent means hidden. Deliberately NOT part of a tool's params:
   * paramsOf() strips it, so it never enters the sizing/edit pipeline.
   */
  revealed?: boolean;
}

/**
 * A concrete object on the board. Tool-specific params live alongside the base
 * fields as extra keys (e.g. a numberline carries start/step/intervals/hide).
 * Tools narrow this to `BoardObjectBase & P` in their draw/Component signatures.
 */
export type AnyBoardObject = BoardObjectBase & Record<string, unknown>;

/** A freehand pen / highlighter / eraser stroke. Points are in world
 *  coordinates. `highlighter` renders like `pen` but translucent and wide (a
 *  marker over the ink); `eraser` strokes are applied geometrically and never
 *  stored, so a persisted stroke is only ever `pen` or `highlighter`. */
export interface Stroke {
  id: string;
  mode: "pen" | "eraser" | "highlighter";
  color: string;
  size: number;
  points: { x: number; y: number }[];
  /**
   * Z-order key (see src/collab/docModel.ts). Shapes live in unordered CRDT
   * maps, so draw order is derived by sorting on this field. Objects carry the
   * same key via their open Record type. Optional for legacy documents.
   */
  order?: number;
  /**
   * GROUPING. Shapes sharing a groupId select/move/delete as one unit
   * (Ctrl+G / Ctrl+Shift+G, board/commands.ts). Objects carry the same key
   * via their open Record type. Absent = ungrouped.
   */
  groupId?: string;
}

export type Background = "squared" | "lined" | "blank";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export type ToolName = "pen" | "text" | "math" | "eraser" | "select" | "pan";

/** The syncable document. This is what a BoardRepository persists. */
export interface BoardDocument {
  id: string;
  name: string;
  background: Background;
  objects: AnyBoardObject[];
  strokes: Stroke[];
  createdAt: number;
  updatedAt: number;
  /**
   * WHICH APP FLAVOUR OWNS THIS BOARD ("maths" | "language"). Stamped once at
   * creation from the active profile and carried everywhere the document goes —
   * the working draft, the saved library entry, and the shared doc's meta — so
   * each app lists and re-opens only its own boards. Absent on documents saved
   * before this field existed: those predate the language board and are treated
   * as maths (see `subjectOf`), so old boards keep loading and never leak into
   * the language list.
   */
  subject?: Subject;
  /**
   * CUSTOM CONTENT THAT TRAVELS WITH THE BOARD (language board). Language
   * widgets store only references (theme ids, level, language codes) and resolve
   * the actual words live from the per-device content catalogue. So a board
   * built from an IMPORTED content pack would look empty to a collaborator (or
   * on another device) that never imported it. To prevent that, the pack(s) a
   * board's widgets actually draw from are embedded here, and re-registered into
   * the catalogue when the board is loaded or joined. Absent on boards that use
   * only the built-in content (the common case), so ordinary boards are
   * unchanged.
   */
  contentPacks?: ContentPack[];
  /**
   * WHAT THIS BOARD TEACHES (language board) — its languages and the content
   * packs chosen for it, as declared when the board was created and whenever it
   * was changed since.
   *
   * `contentPacks` above is the DATA that travels; this is the CHOICE. Keeping
   * it is what lets a saved board say "🇬🇧→🇫🇷 · Base + Kitchen" in the boards
   * list, reopen teaching exactly what it taught before, and combine several
   * packs of the same languages. Without it a board could only be read back
   * through the packs its widgets happen to reference, so an empty board — or
   * one whose pack merely adds words to a built-in theme — came back on
   * whatever content the device last happened to have switched on.
   *
   * Absent on maths boards and on language boards saved before this existed;
   * those fall back to reading the choice off the document (see
   * lang/content/boardContent.ts).
   */
  contentSetup?: BoardContentSetup;
}

/**
 * A board's declared content choice: which way round the languages go, and
 * which packs feed it. Pack ids, not pack data — "base" is the built-in pack,
 * every other id resolves against the device library or the packs the board
 * carries in `contentPacks`. An id that resolves to neither is content this
 * device doesn't have; the UI says so rather than pretending.
 */
export interface BoardContentSetup {
  /** The language the learner already speaks. */
  known: string;
  /** The language the board teaches. */
  learning: string;
  /** Ids of the packs this board teaches from — at least one. */
  packIds: string[];
}

/**
 * Whether a value read off a document (localStorage, a shared doc's meta) is a
 * usable content setup. Lives here, next to the type and free of any language
 * imports, so the document layer can gate what it reads without pulling the
 * content registry into every board.
 */
export function isContentSetup(value: unknown): value is BoardContentSetup {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
  return (
    str(s.known) &&
    str(s.learning) &&
    s.known !== s.learning &&
    Array.isArray(s.packIds) &&
    s.packIds.length > 0 &&
    s.packIds.every(str)
  );
}

/** Lightweight listing entry (no objects/strokes), for the boards gallery. */
export interface BoardSummary {
  id: string;
  name: string;
  updatedAt: number;
  /**
   * True for a board that lives in the ONLINE store (a shared Y-Sweet doc):
   * opening it re-joins the shared session instead of loading local content.
   * Absent/false for an ordinary local library board.
   */
  remote?: boolean;
  /**
   * What a LOCAL language board teaches, so the boards list can show it without
   * loading every document twice (see LocalBoardRepository.list). Absent for
   * maths boards and for remote boards, whose content lives online behind a
   * pointer.
   */
  content?: BoardContentSetup;
}

/**
 * A pointer to a shared board that lives online (Y-Sweet). It is deliberately
 * NOT a BoardDocument: the content lives in the online store, so we persist only
 * enough to list it and re-join it (`id` is the board's join code). This keeps a
 * shared board in exactly ONE place — no local copy shadowing the online one.
 */
export interface RemoteBoardRef {
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

/**
 * The subject a board belongs to. Documents saved before the `subject` field
 * existed carry none; they predate the language board, so they are maths boards.
 * The single place that resolves that default — persistence and any subject
 * filtering go through here rather than repeating `?? "maths"`.
 */
export function subjectOf(doc: { subject?: Subject }): Subject {
  return doc.subject ?? "maths";
}

/** Default name for a board that has never been explicitly saved. */
export const UNTITLED_NAME = "Untitled board";

/**
 * Build a blank, in-memory board document. Does NOT persist it anywhere. The
 * starting paper defaults to the active board profile's (squares for maths,
 * lines for language); pass `background` to override.
 */
export function newBoardDocument(
  name: string = UNTITLED_NAME,
  background: Background = PROFILE.defaultBackground,
  /** The language board's content choice, made in the new-board flow. */
  contentSetup?: BoardContentSetup,
): BoardDocument {
  const now = Date.now();
  return {
    id: id(),
    name,
    subject: PROFILE.subject,
    background,
    objects: [],
    strokes: [],
    createdAt: now,
    updatedAt: now,
    ...(contentSetup ? { contentSetup } : {}),
  };
}
