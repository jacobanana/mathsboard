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
  DraftEnvelope,
  RemoteBoardRef,
} from "@/board/types";
import { newBoardDocument, subjectOf } from "@/board/types";
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

// Reserved keys that share the PREFIX but are NOT library boards, so list()
// must skip them (their ids never collide because library ids are UUIDs). Every
// subject's draft key is reserved, not just this repository's, so one flavour's
// list() never mistakes another flavour's draft envelope for a board.
const RESERVED_KEYS = new Set<string>([
  REMOTES_KEY,
  ...SUBJECTS.map(draftKeyFor),
]);

interface RemoteEntry {
  name: string;
  updatedAt: number;
  subject?: Subject;
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
        out.push({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
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
}

/** Shared singleton used by the store, scoped to the running app's subject. */
export const localRepository: BoardRepository = new LocalBoardRepository();
