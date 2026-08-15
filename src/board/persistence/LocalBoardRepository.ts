// localStorage-backed BoardRepository. Each board is stored under
// "mathsboard:<id>". This is the only place that knows the storage format;
// swap it for a backend client later without touching the store.
//
// SUBJECT SCOPING. A maths board and a language board share this storage but
// must not share a LIST: each app flavour sees only its own boards. The
// repository is constructed for one subject (the running app's, by default) and
// filters everything it returns to that subject. Documents saved before the
// subject field existed carry none and read as maths (subjectOf), so old boards
// keep loading in the maths app and never surface in the language list.

import type { BoardRepository } from "@/board/persistence/BoardRepository";
import type {
  BoardDocument,
  BoardSummary,
  Camera,
  DraftEnvelope,
  RemoteBoardRef,
} from "@/board/types";
import { isContentSetup, newBoardDocument, subjectOf } from "@/board/types";
import { SUBJECT, SUBJECTS, type Subject } from "@/subject";

const PREFIX = "mathsboard:";
const keyFor = (boardId: string): string => PREFIX + boardId;

// The working draft (the single continuously-autosaved current board) is
// PER-SUBJECT: opening the language app must never resume a maths board, and
// vice versa. Maths keeps the original key so drafts saved before this split
// still load; each other subject gets its own namespaced key.
const draftKeyFor = (subject: Subject): string =>
  subject === "maths" ? "mathsboard:draft" : `mathsboard:${subject}:draft`;

// The remembered remote (shared) boards, as one
// { id -> { name, updatedAt, subject? } } map. Only pointers — the shared
// content itself lives online in Y-Sweet. Shared by all subjects; each entry
// records its own subject so a flavour lists only its shared boards (legacy
// entries carry none and read as maths).
const REMOTES_KEY = "mathsboard:remotes";

// Where each board was last left (camera x/y/scale), as one { id -> view } map.
// Per-device and local-only — a view never enters the document, so collaborators
// on a shared board each keep their own place. Board ids are unique across
// subjects, so one map serves every flavour. Capped (LRU by `at`) so a long-lived
// library never grows this without bound.
const VIEWS_KEY = "mathsboard:views";
const MAX_VIEWS = 200;

// Reserved keys that share the PREFIX but are NOT library boards, so list()
// must skip them (their ids never collide because library ids are UUIDs). Every
// subject's draft key is reserved, not just this repository's, so one flavour's
// list() never mistakes another flavour's draft envelope for a board.
const RESERVED_KEYS = new Set<string>([
  REMOTES_KEY,
  VIEWS_KEY,
  ...SUBJECTS.map(draftKeyFor),
]);

interface RemoteEntry {
  name: string;
  updatedAt: number;
  subject?: Subject;
}

/** A stored camera plus when it was last written (for LRU eviction). */
interface ViewEntry extends Camera {
  at: number;
}

/** Is this a usable stored camera? Guards against hand-edited / corrupt entries
 *  restoring a board to a blank (NaN-transformed) canvas. */
function isCamera(v: unknown): v is ViewEntry {
  const c = v as Camera | null;
  return (
    !!c &&
    Number.isFinite(c.x) &&
    Number.isFinite(c.y) &&
    Number.isFinite(c.scale) &&
    c.scale > 0
  );
}

export class LocalBoardRepository implements BoardRepository {
  private readonly draftKey: string;

  constructor(private readonly subject: Subject = SUBJECT) {
    this.draftKey = draftKeyFor(subject);
  }

  async list(): Promise<BoardSummary[]> {
    const out: BoardSummary[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || RESERVED_KEYS.has(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const doc = JSON.parse(raw) as BoardDocument;
        // A board belongs to exactly one subject; show only this flavour's.
        if (subjectOf(doc) !== this.subject) continue;
        out.push({
          id: doc.id,
          name: doc.name,
          updatedAt: doc.updatedAt,
          // What a language board teaches, so the boards list can say so
          // without loading every document a second time. Read straight off the
          // document (isContentSetup gates it) — deriving it for a board that
          // predates the field is the language layer's job, not storage's.
          ...(isContentSetup(doc.contentSetup) ? { content: doc.contentSetup } : {}),
        });
      } catch {
        // Ignore corrupt entries.
      }
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  async load(boardId: string): Promise<BoardDocument | null> {
    const raw = localStorage.getItem(keyFor(boardId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BoardDocument;
    } catch {
      return null;
    }
  }

  async save(doc: BoardDocument): Promise<void> {
    // Stamp this repository's subject onto a document that lacks one (a legacy
    // board being re-saved), so it settles into a definite flavour rather than
    // relying on the maths default forever.
    const stamped = doc.subject ? doc : { ...doc, subject: this.subject };
    localStorage.setItem(keyFor(doc.id), JSON.stringify(stamped));
  }

  async create(name?: string): Promise<BoardDocument> {
    const doc = newBoardDocument(name);
    await this.save(doc);
    return doc;
  }

  async rename(boardId: string, name: string): Promise<void> {
    const doc = await this.load(boardId);
    if (!doc) return;
    await this.save({ ...doc, name, updatedAt: Date.now() });
  }

  async remove(boardId: string): Promise<void> {
    localStorage.removeItem(keyFor(boardId));
  }

  // --- remembered remote (shared) boards ---
  private readRemotes(): Record<string, RemoteEntry> {
    const raw = localStorage.getItem(REMOTES_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, RemoteEntry>;
    } catch {
      return {};
    }
  }

  async listRemotes(): Promise<RemoteBoardRef[]> {
    const map = this.readRemotes();
    return Object.entries(map)
      // A shared board was joined/created inside one app flavour; list only
      // this flavour's. Legacy entries carry no subject and read as maths.
      .filter(([, v]) => (v.subject ?? "maths") === this.subject)
      .map(([id, v]) => ({ id, name: v.name, updatedAt: v.updatedAt }));
  }

  async saveRemote(ref: RemoteBoardRef): Promise<void> {
    const map = this.readRemotes();
    map[ref.id] = {
      name: ref.name,
      updatedAt: ref.updatedAt,
      subject: this.subject,
    };
    localStorage.setItem(REMOTES_KEY, JSON.stringify(map));
  }

  async removeRemote(id: string): Promise<void> {
    const map = this.readRemotes();
    if (!(id in map)) return;
    delete map[id];
    localStorage.setItem(REMOTES_KEY, JSON.stringify(map));
  }

  // --- working draft (per-subject; see draftKeyFor) ---
  async loadDraft(): Promise<DraftEnvelope | null> {
    const raw = localStorage.getItem(this.draftKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DraftEnvelope;
    } catch {
      return null;
    }
  }

  async saveDraft(draft: DraftEnvelope): Promise<void> {
    localStorage.setItem(this.draftKey, JSON.stringify(draft));
  }

  async clearDraft(): Promise<void> {
    localStorage.removeItem(this.draftKey);
  }

  // --- per-board camera views ---
  private readViews(): Record<string, ViewEntry> {
    const raw = localStorage.getItem(VIEWS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, ViewEntry>;
    } catch {
      return {};
    }
  }

  async loadView(boardId: string): Promise<Camera | null> {
    const v = this.readViews()[boardId];
    return isCamera(v) ? { x: v.x, y: v.y, scale: v.scale } : null;
  }

  async saveView(boardId: string, camera: Camera): Promise<void> {
    if (!isCamera(camera)) return;
    const map = this.readViews();
    map[boardId] = { x: camera.x, y: camera.y, scale: camera.scale, at: Date.now() };
    const ids = Object.keys(map);
    if (ids.length > MAX_VIEWS) {
      // Drop the least-recently-left boards first; the current one was just
      // stamped, so it can never be the one evicted.
      ids
        .sort((a, b) => (map[a].at ?? 0) - (map[b].at ?? 0))
        .slice(0, ids.length - MAX_VIEWS)
        .forEach((id) => delete map[id]);
    }
    localStorage.setItem(VIEWS_KEY, JSON.stringify(map));
  }

  async removeView(boardId: string): Promise<void> {
    const map = this.readViews();
    if (!(boardId in map)) return;
    delete map[boardId];
    localStorage.setItem(VIEWS_KEY, JSON.stringify(map));
  }
}

/** Shared singleton used by the store, scoped to the running app's subject. */
export const localRepository: BoardRepository = new LocalBoardRepository();
